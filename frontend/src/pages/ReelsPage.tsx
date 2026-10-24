import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMedia, toggleFavorite } from '../api/media';
import ReelItem from '../components/Reels/ReelItem';

export const ReelsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState<'video' | ''>('video');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Infinite query for media
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['reels', filterType],
    queryFn: ({ pageParam = 1 }) =>
      fetchMedia({
        page: pageParam,
        per_page: 20,
        type: filterType,
        sort: 'date_desc',
      }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  });

  const allItems = data?.pages.flatMap((page) => page.items) || [];

  // Toggle favorite mutation
  const favoriteMutation = useMutation({
    mutationFn: toggleFavorite,
    onSuccess: (updated) => {
      queryClient.setQueryData(['reels', filterType], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: any) =>
              item.uuid === updated.uuid
                ? { ...item, is_favorite: updated.is_favorite }
                : item,
            ),
          })),
        };
      });
      // Invalidate general media query as well
      queryClient.invalidateQueries({ queryKey: ['media'] });
    },
  });

  // Track active slide with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = Number(entry.target.getAttribute('data-index'));
            if (!isNaN(index)) {
              setActiveIndex(index);
              // If near end, fetch next page
              if (index >= allItems.length - 3 && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: [0.6],
      },
    );

    const currentRefs = itemRefs.current;
    currentRefs.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
      currentRefs.forEach((el) => {
        if (el) observer.unobserve(el);
      });
    };
  }, [allItems.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Keyboard navigation on desktop
  const scrollToReel = useCallback(
    (index: number) => {
      if (index >= 0 && index < allItems.length) {
        const el = itemRefs.current[index];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    },
    [allItems.length],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToReel(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToReel(activeIndex - 1);
      } else if (e.key === 'm' || e.key === 'M') {
        setIsMuted((prev) => !prev);
      } else if (e.key === 'l' || e.key === 'L') {
        const currentItem = allItems[activeIndex];
        if (currentItem) {
          favoriteMutation.mutate(currentItem.uuid);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, allItems, favoriteMutation, scrollToReel]);

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden">
      {/* Top Floating Header Filter */}
      <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md p-1 rounded-full border border-white/10 pointer-events-auto">
          <button
            onClick={() => setFilterType('video')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
              filterType === 'video'
                ? 'bg-mv-accent text-white shadow-md'
                : 'text-white/70 hover:text-white'
            }`}
          >
            🎬 Vidéos
          </button>
          <button
            onClick={() => setFilterType('')}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
              filterType === ''
                ? 'bg-mv-accent text-white shadow-md'
                : 'text-white/70 hover:text-white'
            }`}
          >
            🌐 Tous les médias
          </button>
        </div>

        {/* Global Sound indicator */}
        <button
          onClick={() => setIsMuted((m) => !m)}
          className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white pointer-events-auto hover:scale-105 transition-transform"
          title={isMuted ? 'Activer le son' : 'Couper le son'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Main Snap Vertical Scroll Container */}
      {allItems.length > 0 ? (
        <div
          ref={containerRef}
          className="w-full h-[100dvh] overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar"
        >
          {allItems.map((media, idx) => (
            <div
              key={media.uuid}
              data-index={idx}
              ref={(el) => (itemRefs.current[idx] = el)}
              className="w-full h-[100dvh] snap-start snap-always"
            >
              <ReelItem
                media={media}
                isActive={idx === activeIndex}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted((m) => !m)}
                onToggleFavorite={(uuid) => favoriteMutation.mutate(uuid)}
              />
            </div>
          ))}

          {/* Bottom loader */}
          {isFetchingNextPage && (
            <div className="w-full h-20 flex items-center justify-center bg-black text-white/50 text-xs">
              Chargement des vidéos suivantes…
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="w-full h-full flex flex-col items-center justify-center px-6 text-center text-white">
          <span className="text-6xl mb-4">🎬</span>
          <h2 className="text-xl font-bold mb-2">
            {filterType === 'video'
              ? 'Aucune vidéo trouvée'
              : 'Aucun média disponible'}
          </h2>
          <p className="text-sm text-mv-text-muted max-w-sm mb-6">
            {filterType === 'video'
              ? 'Ton dossier média ne contient pas encore de fichiers vidéo (.mp4, .mov, etc.).'
              : 'Commence par uploader ou scanner des médias sur ton serveur.'}
          </p>

          {filterType === 'video' && (
            <button
              onClick={() => setFilterType('')}
              className="px-5 py-2.5 rounded-full bg-mv-accent hover:bg-mv-accent-hover text-white text-sm font-semibold transition-all shadow-lg hover:shadow-violet-500/25"
            >
              Voir les photos en mode Reels vertical ✨
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ReelsPage;
