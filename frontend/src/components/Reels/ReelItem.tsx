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

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const ReelItem: React.FC<ReelItemProps> = ({
  media,
  isActive,
  isMuted,
  onToggleMute,
  onToggleFavorite,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(media.duration || 0);
  const [progress, setProgress] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');

  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  const fileUrl = getFileUrl(media.uuid);
  const thumbUrl = getThumbnailUrl(media.uuid);
  const isVideo = media.media_type === 'video';

  // Play/pause on active state change
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
            video.muted = true;
            video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          });
      }
    } else {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    }
  }, [isActive, isVideo]);

  // Keep muted in sync
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Update progress & times
  const handleTimeUpdate = () => {
    if (isScrubbing) return;
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    const dur = video.duration || media.duration || 1;
    setDuration(dur);
    setProgress((video.currentTime / dur) * 100);
  };

  // Relative Seek (-5s, +5s, etc.)
  const seekRelative = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration || media.duration || 1;
    const target = Math.max(0, Math.min(dur, video.currentTime + seconds));
    video.currentTime = target;
    setCurrentTime(target);
    setProgress((target / dur) * 100);

    setSeekFeedback(seconds < 0 ? `⏪ ${seconds}s` : `⏩ +${seconds}s`);
    setTimeout(() => setSeekFeedback(null), 700);
  }, [media.duration]);

  // Keyboard navigation for active item (Left/Right arrow seek)
  useEffect(() => {
    if (!isActive || !isVideo) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekRelative(5);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
          } else {
            videoRef.current.pause();
            setIsPlaying(false);
          }
          setShowPlayIcon(true);
          setTimeout(() => setShowPlayIcon(false), 500);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isVideo, seekRelative]);

  // Screen click & Double-tap handler (Left = Rewind, Right = Fast-forward, Center = Like)
  const handleScreenClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300;

      if (now - lastTapRef.current.time < DOUBLE_TAP_DELAY) {
        // Double Tap detected!
        if (clickX < width * 0.35 && isVideo) {
          // Double-tap on Left side → Rewind 5s
          seekRelative(-5);
        } else if (clickX > width * 0.65 && isVideo) {
          // Double-tap on Right side → Fast-forward 5s
          seekRelative(5);
        } else {
          // Double-tap in Center → Like ❤️
          setShowHeartAnim(true);
          setTimeout(() => setShowHeartAnim(false), 900);
          if (!media.is_favorite) {
            onToggleFavorite(media.uuid);
          }
        }
        lastTapRef.current = { time: 0, x: 0 };
      } else {
        lastTapRef.current = { time: now, x: clickX };

        // Single tap → Play / Pause
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
    [isVideo, media.is_favorite, media.uuid, onToggleFavorite, seekRelative],
  );

  // Scrubber Drag & Click Handling
  const handleScrubMove = useCallback(
    (clientX: number) => {
      const scrubber = scrubberRef.current;
      const video = videoRef.current;
      if (!scrubber || !video) return;

      const rect = scrubber.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const pct = clickX / rect.width;
      const dur = video.duration || duration || 1;
      const targetTime = pct * dur;

      video.currentTime = targetTime;
      setCurrentTime(targetTime);
      setProgress(pct * 100);
    },
    [duration],
  );

  const handleScrubMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsScrubbing(true);
    handleScrubMove(e.clientX);

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleScrubMove(moveEvent.clientX);
    };

    const onMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleScrubTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    setIsScrubbing(true);
    handleScrubMove(e.touches[0].clientX);
  };

  const handleScrubTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    handleScrubMove(e.touches[0].clientX);
  };

  const handleScrubTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    setIsScrubbing(false);
  };

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
          onLoadedMetadata={() => {
            if (videoRef.current?.duration) {
              setDuration(videoRef.current.duration);
            }
          }}
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

      {/* Seek Feedback Indicator (⏩ +5s / ⏪ -5s) */}
      <AnimatePresence>
        {seekFeedback && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.1, opacity: 1 }}
            exit={{ scale: 1.3, opacity: 0 }}
            className="absolute z-30 pointer-events-none bg-black/70 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/20 text-white font-bold text-lg shadow-2xl flex items-center gap-2"
          >
            <span>{seekFeedback}</span>
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

      {/* Subtle top & bottom gradients */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-10" />

      {/* Right Action Sidebar (TikTok style) */}
      <div
        className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Like Button */}
        <button
          onClick={() => onToggleFavorite(media.uuid)}
          className="flex flex-col items-center group"
          title="Favori"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
            <span className={`text-2xl ${media.is_favorite ? 'scale-110' : ''}`}>
              {media.is_favorite ? '❤️' : '🤍'}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
            {media.is_favorite ? 'Liké' : 'Like'}
          </span>
        </button>

        {/* Mute / Unmute Button */}
        {isVideo && (
          <button
            onClick={onToggleMute}
            className="flex flex-col items-center group"
            title={isMuted ? 'Activer le son' : 'Couper le son'}
          >
            <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
              <span className="text-xl text-white">
                {isMuted ? '🔇' : '🔊'}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
              {isMuted ? 'Muet' : 'Son'}
            </span>
          </button>
        )}

        {/* Fit mode toggle */}
        <button
          onClick={() => setFitMode((m) => (m === 'contain' ? 'cover' : 'contain'))}
          className="flex flex-col items-center group"
          title="Bascule Zoom / Format"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
            <span className="text-xl text-white">
              {fitMode === 'cover' ? '🔍' : '↔️'}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
            {fitMode === 'cover' ? 'Remplir' : 'Ajuster'}
          </span>
        </button>

        {/* Info drawer toggle */}
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="flex flex-col items-center group"
          title="Détails"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
            <span className="text-xl text-white">ℹ️</span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
            Infos
          </span>
        </button>

        {/* Download direct link */}
        <a
          href={fileUrl}
          download={media.file_name}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center group"
          title="Télécharger"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 group-hover:scale-110 group-active:scale-95 transition-all">
            <span className="text-xl text-white">⬇️</span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 shadow-sm">
            Sauver
          </span>
        </a>
      </div>

      {/* Bottom Info Section & Quick Seek Buttons */}
      <div
        className="absolute left-4 right-20 bottom-14 z-20 flex flex-col gap-1.5 text-white"
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

        {/* Interactive Video Controls Row (Timer + 10s Skip Buttons) */}
        {isVideo && (
          <div className="flex items-center gap-3 pt-1">
            {/* Timestamp Badge */}
            <span className="text-xs font-mono font-semibold text-white/90 bg-black/50 px-2 py-0.5 rounded-md border border-white/10 backdrop-blur-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Rewind 10s */}
            <button
              onClick={() => seekRelative(-10)}
              className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-xs font-semibold text-white backdrop-blur-sm transition-all flex items-center gap-1 shadow-sm"
              title="Reculer de 10s"
            >
              <span>⏪</span>
              <span>-10s</span>
            </button>

            {/* Fast Forward 10s */}
            <button
              onClick={() => seekRelative(10)}
              className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-xs font-semibold text-white backdrop-blur-sm transition-all flex items-center gap-1 shadow-sm"
              title="Avancer de 10s"
            >
              <span>+10s</span>
              <span>⏩</span>
            </button>
          </div>
        )}
      </div>

      {/* Interactive Video Progress Bar Scrubber (Click & Drag / Touch) */}
      {isVideo && (
        <div
          ref={scrubberRef}
          onClick={(e) => {
            e.stopPropagation();
            handleScrubMove(e.clientX);
          }}
          onMouseDown={handleScrubMouseDown}
          onTouchStart={handleScrubTouchStart}
          onTouchMove={handleScrubTouchMove}
          onTouchEnd={handleScrubTouchEnd}
          className="absolute bottom-0 left-0 right-0 h-7 z-30 flex items-end cursor-pointer group px-0 pb-1"
        >
          {/* Scrubber Background Bar */}
          <div className="relative w-full h-1.5 group-hover:h-3 transition-all duration-150 bg-white/25 backdrop-blur-sm overflow-visible">
            {/* Filled Progress Bar */}
            <div
              className="h-full bg-mv-accent relative transition-all duration-75"
              style={{ width: `${progress}%` }}
            >
              {/* Scrubbing Thumb Dot */}
              <div
                className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg border border-mv-accent transition-transform ${
                  isScrubbing ? 'scale-125' : 'group-hover:scale-110'
                }`}
              />
            </div>

            {/* Floating Time Tooltip while scrubbing */}
            {isScrubbing && (
              <div
                className="absolute -top-7 -translate-x-1/2 bg-black/90 text-white font-mono text-[10px] px-2 py-0.5 rounded border border-white/20 pointer-events-none shadow-xl"
                style={{ left: `${progress}%` }}
              >
                {formatTime(currentTime)}
              </div>
            )}
          </div>
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
              {duration > 0 && (
                <p><strong className="text-white">Durée :</strong> {formatTime(duration)} ({Math.round(duration)}s)</p>
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
