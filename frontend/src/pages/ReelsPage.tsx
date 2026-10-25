import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMedia, toggleFavorite, type MediaQueryParams } from '../api/media';
import ReelItem from '../components/Reels/ReelItem';

type ReelFilter = 'vertical' | 'video' | 'all';

// Only the active reel and its direct neighbours get a real <video> element.
// iOS Safari struggles (or reloads the page) with many decoders at once.
const MOUNT_WINDOW = 1;

const FILTERS: { id: ReelFilter; label: string }[] = [
  { id: 'vertical', label: '📱 Verticales' },
  { id: 'video', label: '🎬 Vidéos' },
  { id: 'all', label: '🌐 Tout' },
];

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / storage blocked: preference just isn't remembered
  }
}

function newSeed() {
  return Math.floor(Math.random() * 2_000_000_000);
}

function queryForFilter(filter: ReelFilter): MediaQueryParams {
  if (filter === 'vertical') return { type: 'video', orientation: 'portrait' };
  if (filter === 'video') return { type: 'video' };
  // Text notes make no sense as a full-screen reel
  return { type: 'image,video' };
}

export const ReelsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [filter, setFilterState] = useState<ReelFilter>(() =>
    readPref('mv_reels_filter', ['vertical', 'video', 'all'] as const, 'vertical'),
  );
  const [shuffle, setShuffleState] = useState(() => readPref('mv_reels_shuffle', ['1', '0'] as const, '0') === '1');
  const [seed, setSeed] = useState(newSeed);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMutedState] = useState(
    () => readPref('mv_reels_muted', ['1', '0'] as const, '1') === '1',
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // User choice is remembered; an autoplay fallback to mute is not
  const setMuted = useCallback((muted: boolean, remember = true) => {
    setIsMutedState(muted);
    if (remember) writePref('mv_reels_muted', muted ? '1' : '0');
  }, []);
  const toggleMute = useCallback(() => {
    setIsMutedState((m) => {
      writePref('mv_reels_muted', m ? '0' : '1');
      return !m;
    });
  }, []);

  const setFilter = (f: ReelFilter) => {
    setFilterState(f);
    writePref('mv_reels_filter', f);
  };
  const toggleShuffle = () => {
    setShuffleState((s) => {
      writePref('mv_reels_shuffle', s ? '0' : '1');
      return !s;
    });
    setSeed(newSeed());
  };

  const queryKey = useMemo(() => ['reels', filter, shuffle ? seed : 'date'], [filter, shuffle, seed]);
  const listId = queryKey.join('|');
  const shownListRef = useRef<string | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      fetchMedia({
        page: pageParam,
        per_page: 20,
        ...queryForFilter(filter),
        sort: shuffle ? 'random' : 'date_desc',
        seed: shuffle ? seed : undefined,
      }),
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
  });

  const allItems = useMemo(() => data?.pages.flatMap((page) => page.items) || [], [data]);

  // Back to the first reel once a *new* list (filter / shuffle) is on screen.
  // Done when its items are rendered, not when the button is clicked, otherwise the
  // reset happens before the data arrives and the screen stays on another reel.
  useEffect(() => {
    if (allItems.length === 0 || shownListRef.current === listId) return;
    shownListRef.current = listId;
    setActiveIndex(0);
    // 'instant' overrides the CSS scroll-smooth, which could be interrupted
    containerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [listId, allItems.length]);

  const favoriteMutation = useMutation({
    mutationFn: toggleFavorite,
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: any) =>
              item.uuid === updated.uuid ? { ...item, is_favorite: updated.is_favorite } : item,
            ),
          })),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['media'] });
    },
  });
  const { mutate: mutateFavorite } = favoriteMutation;
  const onToggleFavorite = useCallback((uuid: string) => mutateFavorite(uuid), [mutateFavorite]);

  // Track active slide with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = Number(entry.target.getAttribute('data-index'));
            if (!isNaN(index)) {
              setActiveIndex(index);
              if (index >= allItems.length - 3 && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }
          }
        });
      },
      { root: containerRef.current, threshold: [0.6] },
    );

    itemRefs.current.slice(0, allItems.length).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [allItems.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  const scrollToReel = useCallback(
    (index: number) => {
      if (index >= 0 && index < allItems.length) {
        itemRefs.current[index]?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    [allItems.length],
  );

  // Keyboard navigation on desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToReel(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToReel(activeIndex - 1);
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if (e.key === 'l' || e.key === 'L') {
        const currentItem = allItems[activeIndex];
        if (currentItem) onToggleFavorite(currentItem.uuid);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, allItems, onToggleFavorite, scrollToReel, toggleMute]);

  const emptyText: Record<ReelFilter, { title: string; body: string }> = {
    vertical: {
      title: 'Aucune vidéo verticale',
      body: "Aucune vidéo au format portrait (9:16) n'a été trouvée. Les vidéos déjà indexées sont réanalysées au démarrage du serveur.",
    },
    video: {
      title: 'Aucune vidéo trouvée',
      body: 'Ton dossier média ne contient pas encore de fichiers vidéo (.mp4, .mov, etc.).',
    },
    all: { title: 'Aucun média disponible', body: 'Commence par uploader ou scanner des médias sur ton serveur.' },
  };

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden">
      {/* Top floating header */}
      <div className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] left-4 right-4 z-30 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1 bg-black/50 backdrop-blur-md p-1 rounded-full border border-white/10 pointer-events-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                filter === f.id ? 'bg-mv-accent text-white shadow-md' : 'text-white/70 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={toggleShuffle}
            className={`w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center text-white hover:scale-105 transition-all ${
              shuffle ? 'bg-mv-accent border-white/30' : 'bg-black/50 border-white/10'
            }`}
            title={shuffle ? 'Ordre aléatoire (re-cliquer pour revenir aux plus récents)' : 'Ordre aléatoire'}
            aria-pressed={shuffle}
          >
            🔀
          </button>
          <button
            onClick={toggleMute}
            className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:scale-105 transition-transform"
            title={isMuted ? 'Activer le son' : 'Couper le son'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

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
                isNear={Math.abs(idx - activeIndex) <= MOUNT_WINDOW}
                preloadNext={idx === activeIndex + 1}
                isMuted={isMuted}
                onToggleMute={toggleMute}
                onAutoplayMuted={() => setMuted(true, false)}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          ))}

          {isFetchingNextPage && (
            <div className="w-full h-20 flex items-center justify-center bg-black text-white/50 text-xs">
              Chargement des suivants…
            </div>
          )}
        </div>
      ) : isLoading ? (
        <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">Chargement…</div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center px-6 text-center text-white">
          <span className="text-6xl mb-4">🎬</span>
          <h2 className="text-xl font-bold mb-2">{emptyText[filter].title}</h2>
          <p className="text-sm text-mv-text-muted max-w-sm mb-6">{emptyText[filter].body}</p>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter(filter === 'vertical' ? 'video' : 'all')}
              className="px-5 py-2.5 rounded-full bg-mv-accent hover:bg-mv-accent-hover text-white text-sm font-semibold transition-all shadow-lg hover:shadow-violet-500/25"
            >
              {filter === 'vertical' ? 'Voir toutes les vidéos' : 'Voir aussi les photos ✨'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ReelsPage;
