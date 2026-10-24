import { useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Media } from '../api/media';
import MediaCard from './MediaCard';

interface MediaGridProps {
  items: Media[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  fetchNextPage: () => void;
  onFavoriteToggle: (uuid: string) => void;
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-0.5">
      {Array.from({ length: 18 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square bg-mv-surface animate-pulse"
        />
      ))}
    </div>
  );
}

function MediaGrid({
  items,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  fetchNextPage,
  onFavoriteToggle,
}: MediaGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '400px',
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  if (isLoading) return <SkeletonGrid />;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-mv-text-muted">
        <span className="text-5xl mb-4">📭</span>
        <p className="text-sm font-medium">No media found</p>
        <p className="text-xs mt-1">Upload something or adjust your filters</p>
      </div>
    );
  }

  return (
    <>
      <motion.div
        className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-0.5"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.02 } },
        }}
      >
        {items.map((item) => (
          <MediaCard
            key={item.uuid}
            media={item}
            onFavoriteToggle={onFavoriteToggle}
          />
        ))}
      </motion.div>

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-4" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-mv-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </>
  );
}

export default MediaGrid;
