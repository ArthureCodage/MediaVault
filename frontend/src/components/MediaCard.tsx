import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Media } from '../api/media';
import { getThumbnailUrl } from '../api/client';

interface MediaCardProps {
  media: Media;
  onFavoriteToggle: (uuid: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MediaCard = React.memo(function MediaCard({ media, onFavoriteToggle }: MediaCardProps) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const thumbUrl = getThumbnailUrl(media.uuid);

  const handleClick = useCallback(() => {
    navigate(`/media/${media.uuid}`);
  }, [navigate, media.uuid]);

  const handleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFavoriteToggle(media.uuid);
    },
    [onFavoriteToggle, media.uuid],
  );

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }}
      className="relative aspect-square bg-mv-surface cursor-pointer group overflow-hidden"
      onClick={handleClick}
    >
      {/* Thumbnail image */}
      {media.media_type !== 'text' && !hasError ? (
        <img
          src={thumbUrl}
          alt={media.file_name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setHasError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-mv-surface">
          <span className="text-3xl">
            {media.media_type === 'video' ? '🎬' : media.media_type === 'text' ? '📄' : '🖼️'}
          </span>
        </div>
      )}

      {/* Skeleton while loading */}
      {!loaded && !hasError && media.media_type !== 'text' && (
        <div className="absolute inset-0 bg-mv-surface animate-pulse" />
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex flex-col justify-between p-2 opacity-0 group-hover:opacity-100">
        {/* Filename */}
        <p className="text-[10px] text-white/90 font-medium truncate leading-tight">
          {media.file_name}
        </p>

        <div className="flex items-end justify-between">
          {/* Favorite */}
          <button
            onClick={handleFavorite}
            className="text-lg leading-none hover:scale-125 transition-transform active:scale-95"
          >
            {media.is_favorite ? '❤️' : '🤍'}
          </button>

          {/* Duration badge for video */}
          {media.media_type === 'video' && media.duration != null && (
            <span className="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded font-medium">
              {formatDuration(media.duration)}
            </span>
          )}
        </div>
      </div>

      {/* Always-visible badges */}
      {media.is_favorite && (
        <div className="absolute top-1.5 right-1.5 group-hover:opacity-0 transition-opacity">
          <span className="text-xs">❤️</span>
        </div>
      )}
      {media.media_type === 'video' && (
        <div className="absolute bottom-1.5 right-1.5 group-hover:opacity-0 transition-opacity">
          <span className="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded font-medium">
            {media.duration != null ? formatDuration(media.duration) : '▶'}
          </span>
        </div>
      )}
    </motion.div>
  );
});

export default MediaCard;
