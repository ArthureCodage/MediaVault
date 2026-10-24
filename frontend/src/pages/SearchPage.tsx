import React, { useState } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMedia, toggleFavorite } from '../api/media';
import { fetchTags, type Tag } from '../api/tags';
import MediaGrid from '../components/MediaGrid';

export const SearchPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<string>('');

  // Fetch tags for the cloud
  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags,
  });

  // Query media with search & tag filters
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['search', query, selectedTagId, selectedType],
    queryFn: ({ pageParam = 1 }) =>
      fetchMedia({
        page: pageParam,
        per_page: 50,
        q: query || undefined,
        tag_id: selectedTagId,
        type: selectedType || undefined,
        sort: 'date_desc',
      }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  });

  const favoriteMutation = useMutation({
    mutationFn: toggleFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['media'] });
    },
  });

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-screen bg-mv-bg text-mv-text p-4 md:p-8 max-w-6xl mx-auto">
      {/* Search Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2 mb-2">
          <span>🔍</span> Explorer & Recherche
        </h1>
        <p className="text-sm text-mv-text-muted mb-4">
          Trouve rapidement n'importe quelle photo, clip vidéo ou texte par mot-clé, tag ou format.
        </p>

        {/* Search Input */}
        <div className="relative mb-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-mv-text-muted">
            🔍
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom de fichier..."
            className="w-full bg-mv-surface border border-mv-border rounded-2xl pl-12 pr-10 py-3.5 text-sm text-white placeholder:text-mv-text-muted outline-none focus:border-mv-accent transition-colors shadow-inner"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Smart Tags Cloud */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-xs font-semibold text-mv-text-muted mr-1">Tags :</span>
            {tags.map((tag: Tag) => {
              const isSelected = selectedTagId === tag.id;
              return (
                <button
                  key={tag.id}
                  onClick={() => setSelectedTagId(isSelected ? null : tag.id)}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all shadow-sm ${
                    isSelected
                      ? 'scale-105 ring-2 ring-white text-white'
                      : 'opacity-85 hover:opacity-100 text-white hover:scale-102'
                  }`}
                  style={{ backgroundColor: tag.color || '#8b5cf6' }}
                >
                  <span>#{tag.name}</span>
                  {tag.media_count > 0 && (
                    <span className="text-[10px] bg-black/30 px-1.5 py-0.2 rounded-full">
                      {tag.media_count}
                    </span>
                  )}
                </button>
              );
            })}
            {selectedTagId != null && (
              <button
                onClick={() => setSelectedTagId(null)}
                className="text-xs text-mv-accent hover:underline ml-1 font-medium"
              >
                Effacer tag
              </button>
            )}
          </div>
        )}

        {/* Type Filter Pills */}
        <div className="flex items-center gap-2">
          {[
            { value: '', label: 'Tout' },
            { value: 'image', label: '📷 Photos' },
            { value: 'video', label: '🎬 Vidéos' },
            { value: 'text', label: '📄 Textes' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setSelectedType(f.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedType === f.value
                  ? 'bg-mv-accent text-white shadow-md'
                  : 'bg-mv-surface text-mv-text-secondary hover:bg-mv-hover'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results grid */}
      <div>
        <div className="flex items-center justify-between mb-3 text-xs text-mv-text-muted">
          <span>{allItems.length} résultats trouvés</span>
        </div>

        <MediaGrid
          items={allItems}
          hasNextPage={!!hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoading={isLoading}
          fetchNextPage={fetchNextPage}
          onFavoriteToggle={(uuid) => favoriteMutation.mutate(uuid)}
        />
      </div>
    </div>
  );
};

export default SearchPage;
