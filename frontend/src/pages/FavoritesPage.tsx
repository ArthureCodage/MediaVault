import { useState, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMedia, toggleFavorite } from '../api/media';
import type { Media } from '../api/media';
import FilterBar from '../components/FilterBar';
import MediaGrid from '../components/MediaGrid';

function FavoritesPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['media', 'favorites', typeFilter, sort, search],
    queryFn: ({ pageParam = 1 }) =>
      fetchMedia({
        page: pageParam,
        per_page: 50,
        type: typeFilter || undefined,
        sort,
        favorite: true,
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
      // Optimistically remove from favorites view
      queryClient.setQueriesData<any>({ queryKey: ['media', 'favorites'] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.filter((item: Media) => item.uuid !== uuid),
          })),
        };
      });
      // Also update the feed cache
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
      {/* Page title */}
      <div className="px-4 pt-4 pb-1">
        <h1 className="text-xl font-bold text-mv-text">❤️ Favorites</h1>
      </div>
      <FilterBar
        activeType={typeFilter}
        onTypeChange={setTypeFilter}
        activeSort={sort}
        onSortChange={setSort}
        searchQuery={search}
        onSearchChange={setSearch}
      />
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

export default FavoritesPage;
