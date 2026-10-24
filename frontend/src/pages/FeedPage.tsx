import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMedia, toggleFavorite } from '../api/media';
import type { Media } from '../api/media';
import FilterBar from '../components/FilterBar';
import MediaGrid from '../components/MediaGrid';

function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlType = searchParams.get('type') || '';
  const urlAlbumId = searchParams.get('album_id') ? Number(searchParams.get('album_id')) : null;
  const urlTagId = searchParams.get('tag_id') ? Number(searchParams.get('tag_id')) : null;

  const [typeFilter, setTypeFilter] = useState(urlType);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [albumId, setAlbumId] = useState<number | null>(urlAlbumId);
  const [tagId, setTagId] = useState<number | null>(urlTagId);
  const [sort, setSort] = useState('date_desc');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (urlType !== typeFilter) setTypeFilter(urlType);
    if (urlAlbumId !== albumId) setAlbumId(urlAlbumId);
    if (urlTagId !== tagId) setTagId(urlTagId);
  }, [urlType, urlAlbumId, urlTagId]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['media', 'feed', typeFilter, folderId, albumId, tagId, sort, search],
    queryFn: ({ pageParam = 1 }) =>
      fetchMedia({
        page: pageParam,
        per_page: 50,
        type: typeFilter || undefined,
        folder_id: folderId,
        album_id: albumId,
        tag_id: tagId,
        sort,
        q: search || undefined,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  });

  const favoriteMutation = useMutation({
    mutationFn: toggleFavorite,
    onMutate: async (uuid: string) => {
      await queryClient.cancelQueries({ queryKey: ['media'] });
      queryClient.setQueriesData<any>({ queryKey: ['media', 'feed'] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: Media) =>
              item.uuid === uuid
                ? { ...item, is_favorite: !item.is_favorite }
                : item,
            ),
          })),
        };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['media'] });
    },
  });

  const handleFavoriteToggle = useCallback(
    (uuid: string) => {
      favoriteMutation.mutate(uuid);
    },
    [favoriteMutation],
  );

  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  return (
    <div className="min-h-full">
      <FilterBar
        activeType={typeFilter}
        onTypeChange={(t) => {
          setTypeFilter(t);
          setSearchParams((prev) => {
            if (t) prev.set('type', t);
            else prev.delete('type');
            return prev;
          });
        }}
        activeFolderId={folderId}
        onFolderChange={setFolderId}
        activeSort={sort}
        onSortChange={setSort}
        searchQuery={search}
        onSearchChange={setSearch}
      />

      {/* Active album or tag filter banner */}
      {(albumId != null || tagId != null) && (
        <div className="px-4 py-2 bg-mv-accent/10 border-b border-mv-accent/20 flex items-center justify-between text-xs text-mv-accent font-medium">
          <span>
            {albumId != null ? '📁 Filtré par album' : '🏷️ Filtré par tag'}
          </span>
          <button
            onClick={() => {
              setAlbumId(null);
              setTagId(null);
              setSearchParams({});
            }}
            className="hover:underline flex items-center gap-1 font-bold"
          >
            ✕ Effacer le filtre
          </button>
        </div>
      )}

      <MediaGrid
        items={allItems}
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        onFavoriteToggle={handleFavoriteToggle}
      />
    </div>
  );
}

export default FeedPage;
