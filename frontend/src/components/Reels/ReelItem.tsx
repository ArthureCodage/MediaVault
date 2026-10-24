import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Media } from '../../api/media';
import { getFileUrl, getThumbnailUrl } from '../../api/client';

interface ReelItemProps {
  media: Media;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onToggleFavorite: (uuid: string) => void;
}

export const ReelItem: React.FC<ReelItemProps> = ({
  media,
  isActive,
  isMuted,
  onToggleMute,
  onToggleFavorite,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const lastTapRef = useRef<number>(0);

  const fileUrl = getFileUrl(media.uuid);
  const thumbUrl = getThumbnailUrl(media.uuid);
  const isVideo = media.media_type === 'video';

  // Handle play/pause when active state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    if (isActive) {
      video.muted = isMuted;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => {
            // Browser autoplay restrictions may require muted
            video.muted = true;
            video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          });
      }
    } else {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
      setProgress(0);
    }
  }, [isActive, isVideo]);

  // Keep muted in sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Track progress
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setProgress((video.currentTime / video.duration) * 100);
  };

  // Tap handler (single tap = play/pause, double tap = like)
  const handleScreenClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300;

      if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
        // Double tap!
        setShowHeartAnim(true);
        setTimeout(() => setShowHeartAnim(false), 900);
        if (!media.is_favorite) {
          onToggleFavorite(media.uuid);
        }
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
        // Single tap toggle play/pause for video
        if (isVideo && videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
          } else {
            videoRef.current.pause();
            setIsPlaying(false);
          }
          setShowPlayIcon(true);
          setTimeout(() => setShowPlayIcon(false), 600);
        }
      }
    },
    [isVideo, media.is_favorite, media.uuid, onToggleFavorite],
  );

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div
      className="relative w-full h-[100dvh] snap-start snap-always bg-black flex items-center justify-center overflow-hidden select-none"
      onClick={handleScreenClick}
    >
      {/* Video or Image Element */}
      {isVideo ? (
        <video
          ref={videoRef}
          src={fileUrl}
          poster={thumbUrl}
          playsInline
          loop
          preload={isActive ? 'auto' : 'metadata'}
          onTimeUpdate={handleTimeUpdate}
          className={`w-full h-full ${
            fitMode === 'cover' ? 'object-cover' : 'object-contain'
          } transition-all duration-200`}
        />
      ) : (
        <img
          src={fileUrl}
          alt={media.file_name}
          className={`w-full h-full ${
            fitMode === 'cover' ? 'object-cover' : 'object-contain'
          } transition-all duration-200`}
          loading={isActive ? 'eager' : 'lazy'}
        />
      )}

      {/* Double tap heart animation */}
      <AnimatePresence>
        {showHeartAnim && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 0.9] }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute z-30 pointer-events-none drop-shadow-2xl"
          >
            <span className="text-8xl">❤️</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play / Pause flash indicator */}
      <AnimatePresence>
        {showPlayIcon && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.9 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="absolute z-20 pointer-events-none bg-black/60 rounded-full p-4 backdrop-blur-sm"
          >
            <span className="text-4xl text-white">
              {isPlaying ? '▶' : '⏸'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle top & bottom gradients for readability */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none z-10" />

      {/* Right Action Sidebar (TikTok style) */}
      <div
        className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Like Button */}
        <button
          onClick={() => onToggleFavorite(media.uuid)}
          className="flex flex-col items-center group"
          title="Favorite"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
            <span className={`text-2xl ${media.is_favorite ? 'scale-110' : ''}`}>
              {media.is_favorite ? '❤️' : '🤍'}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
            {media.is_favorite ? 'Liked' : 'Like'}
          </span>
        </button>

        {/* Mute / Unmute Button (for videos) */}
        {isVideo && (
          <button
            onClick={onToggleMute}
            className="flex flex-col items-center group"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
              <span className="text-xl text-white">
                {isMuted ? '🔇' : '🔊'}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
              {isMuted ? 'Muted' : 'Sound'}
            </span>
          </button>
        )}

        {/* Fit mode toggle (Contain / Cover) */}
        <button
          onClick={() => setFitMode((m) => (m === 'contain' ? 'cover' : 'contain'))}
          className="flex flex-col items-center group"
          title="Toggle Zoom / Fit"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
            <span className="text-xl text-white">
              {fitMode === 'cover' ? '🔍' : '↔️'}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
            {fitMode === 'cover' ? 'Fill' : 'Fit'}
          </span>
        </button>

        {/* Info drawer toggle */}
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="flex flex-col items-center group"
          title="Details"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
            <span className="text-xl text-white">ℹ️</span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
            Info
          </span>
        </button>

        {/* Download direct link */}
        <a
          href={fileUrl}
          download={media.file_name}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center group"
          title="Download"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
            <span className="text-xl text-white">⬇️</span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
            Save
          </span>
        </a>
      </div>

      {/* Bottom Info Section */}
      <div
        className="absolute left-4 right-20 bottom-16 z-20 flex flex-col gap-1 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-mv-accent/80 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
            {media.media_type}
          </span>
          {media.width && media.height && (
            <span className="text-[11px] text-white/70">
              {media.width}×{media.height}
            </span>
          )}
          <span className="text-[11px] text-white/60">
            • {formatFileSize(media.file_size)}
          </span>
        </div>
        <p className="text-sm font-semibold truncate text-white drop-shadow-md">
          {media.file_name}
        </p>
        <p className="text-[11px] text-white/70">
          {new Date(media.file_date).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Video Progress Bar Scrubber */}
      {isVideo && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-30 overflow-hidden">
          <div
            className="h-full bg-mv-accent transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Info Drawer Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="absolute bottom-12 inset-x-4 max-w-md mx-auto z-40 bg-mv-surface/95 backdrop-blur-xl border border-mv-border p-4 rounded-2xl text-mv-text shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-sm text-white">Détails du média</h3>
              <button
                onClick={() => setShowInfo(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5 text-xs text-mv-text-secondary">
              <p><strong className="text-white">Nom :</strong> {media.file_name}</p>
              <p><strong className="text-white">Type :</strong> {media.mime_type}</p>
              <p><strong className="text-white">Taille :</strong> {formatFileSize(media.file_size)}</p>
              {media.width && media.height && (
                <p><strong className="text-white">Résolution :</strong> {media.width} × {media.height}</p>
              )}
              {media.duration && (
                <p><strong className="text-white">Durée :</strong> {Math.round(media.duration)}s</p>
              )}
              <p><strong className="text-white">Date :</strong> {new Date(media.file_date).toLocaleString('fr-FR')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReelItem;
