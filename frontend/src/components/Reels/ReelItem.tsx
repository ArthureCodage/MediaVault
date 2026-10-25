import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Media } from '../../api/media';
import { getFileUrl, getThumbnailUrl } from '../../api/client';

interface ReelItemProps {
  media: Media;
  isActive: boolean;
  /** Within the mount window: render a real <video>; otherwise only the poster image */
  isNear: boolean;
  /** Next reel after the active one: buffer it so the swipe starts instantly */
  preloadNext: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  /** Browser refused autoplay with sound and the video fell back to muted */
  onAutoplayMuted: () => void;
  onToggleFavorite: (uuid: string) => void;
}

const DOUBLE_TAP_DELAY = 250;

/** Portrait media on a portrait screen fills it (TikTok style); anything else is shown whole. */
function defaultFit(media: Media): 'contain' | 'cover' {
  const portraitMedia = !!media.width && !!media.height && media.height > media.width;
  const portraitScreen = typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches;
  return portraitMedia && portraitScreen ? 'cover' : 'contain';
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
  isNear,
  preloadNext,
  isMuted,
  onToggleMute,
  onAutoplayMuted,
  onToggleFavorite,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(media.duration || 0);
  const [progress, setProgress] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [showCenterControls, setShowCenterControls] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>(() => defaultFit(media));

  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  useEffect(
    () => () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    },
    [],
  );

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
          .then(() => {
            setIsPlaying(true);
            setShowCenterControls(false);
          })
          .catch((err: DOMException) => {
            // AbortError = paused/scrolled away before playback started: nothing to do.
            // Only NotAllowedError means autoplay with sound was blocked (iOS/Chrome policy).
            if (err?.name !== 'NotAllowedError' || !isActiveRef.current) return;
            video.muted = true;
            if (!isMuted) onAutoplayMuted();
            video.play()
              .then(() => {
                setIsPlaying(true);
                setShowCenterControls(false);
              })
              .catch(() => setIsPlaying(false));
          });
      }
    } else {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
      setShowCenterControls(false);
      setProgress(0);
      setCurrentTime(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isVideo, isNear]);

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

  // Relative Seek (-5s, +5s, -10s, +10s, etc.)
  const seekRelative = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const dur = video.duration || media.duration || 1;
      const target = Math.max(0, Math.min(dur, video.currentTime + seconds));
      video.currentTime = target;
      setCurrentTime(target);
      setProgress((target / dur) * 100);

      setSeekFeedback(seconds < 0 ? `⏪ ${seconds}s` : `⏩ +${seconds}s`);
      setTimeout(() => setSeekFeedback(null), 700);
    },
    [media.duration],
  );

  // Play / Pause toggle helper
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
      setShowCenterControls(false);
    } else {
      video.pause();
      setIsPlaying(false);
      setShowCenterControls(true);
    }
  }, []);

  // Keyboard navigation for active item (Left/Right arrow seek, Space play/pause)
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
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isVideo, seekRelative, togglePlay]);

  // Screen click & Double-tap handler (Left = Rewind 5s, Right = Fast-forward 5s, Center = Like)
  const handleScreenClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const now = Date.now();

      if (now - lastTapRef.current.time < DOUBLE_TAP_DELAY) {
        // Double tap: cancel the pending single-tap play/pause so liking doesn't pause the video
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        if (clickX < width * 0.35 && isVideo) {
          seekRelative(-5);
        } else if (clickX > width * 0.65 && isVideo) {
          seekRelative(5);
        } else {
          setShowHeartAnim(true);
          setTimeout(() => setShowHeartAnim(false), 900);
          if (!media.is_favorite) {
            onToggleFavorite(media.uuid);
          }
        }
        lastTapRef.current = { time: 0, x: 0 };
      } else {
        lastTapRef.current = { time: now, x: clickX };

        // Single tap → play/pause, but only once we know no second tap follows
        if (isVideo) {
          if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = setTimeout(() => {
            singleTapTimerRef.current = null;
            togglePlay();
          }, DOUBLE_TAP_DELAY);
        }
      }
    },
    [isVideo, media.is_favorite, media.uuid, onToggleFavorite, seekRelative, togglePlay],
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
      {isVideo && isNear ? (
        <video
          ref={videoRef}
          src={fileUrl}
          poster={thumbUrl}
          playsInline
          loop
          preload={isActive || preloadNext ? 'auto' : 'metadata'}
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
      ) : isVideo || media.media_type === 'text' ? (
        // Far-away video (not mounted yet) or text note: lightweight thumbnail only
        <img
          src={thumbUrl}
          alt={media.file_name}
          className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
          loading="lazy"
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
            className="absolute z-30 pointer-events-none bg-black/75 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/20 text-white font-bold text-lg shadow-2xl flex items-center gap-2"
          >
            <span>{seekFeedback}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center Screen Overlay Controls (Rewind 10s | Play/Pause | Fast-Forward 10s) */}
      <AnimatePresence>
        {isVideo && (!isPlaying || showCenterControls) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[25] flex items-center justify-center gap-6 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Rewind 10s Center Button */}
            <button
              onClick={() => seekRelative(-10)}
              className="w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 active:scale-90 text-white flex flex-col items-center justify-center border border-white/20 backdrop-blur-md shadow-2xl transition-all"
              title="Reculer de 10s"
            >
              <span className="text-xl">⏪</span>
              <span className="text-[10px] font-bold mt-0.5">-10s</span>
            </button>

            {/* Play / Pause Center Button */}
            <button
              onClick={togglePlay}
              className="w-[72px] h-[72px] rounded-full bg-mv-accent/90 hover:bg-mv-accent active:scale-90 text-white flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.6)] border-2 border-white/30 backdrop-blur-md transition-all"
              title={isPlaying ? 'Mettre en pause' : 'Reprendre la lecture'}
            >
              <span className="text-3xl ml-1">
                {isPlaying ? '⏸' : '▶'}
              </span>
            </button>

            {/* Fast-forward 10s Center Button */}
            <button
              onClick={() => seekRelative(10)}
              className="w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 active:scale-90 text-white flex flex-col items-center justify-center border border-white/20 backdrop-blur-md shadow-2xl transition-all"
              title="Avancer de 10s"
            >
              <span className="text-xl">⏩</span>
              <span className="text-[10px] font-bold mt-0.5">+10s</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle top & bottom gradients */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-10" />

      {/* Right Action Sidebar (TikTok style) - elevated above BottomNav */}
      <div
        className="absolute right-3 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] md:bottom-20 z-20 flex flex-col items-center gap-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Like Button */}
        <button
          onClick={() => onToggleFavorite(media.uuid)}
          className="flex flex-col items-center group"
          title="Favori"
        >
          <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/15 group-hover:scale-110 group-active:scale-95 transition-all shadow-lg">
            <span className={`text-2xl ${media.is_favorite ? 'scale-110' : ''}`}>
              {media.is_favorite ? '❤️' : '🤍'}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 drop-shadow-md">
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
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/15 group-hover:scale-110 group-active:scale-95 transition-all shadow-lg">
              <span className="text-xl text-white">
                {isMuted ? '🔇' : '🔊'}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-white/90 mt-1 drop-shadow-md">
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
          <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/15 group-hover:scale-110 group-active:scale-95 transition-all shadow-lg">
            <span className="text-xl text-white">
              {fitMode === 'cover' ? '🔍' : '↔️'}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 drop-shadow-md">
            {fitMode === 'cover' ? 'Remplir' : 'Ajuster'}
          </span>
        </button>

        {/* Info drawer toggle */}
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="flex flex-col items-center group"
          title="Détails"
        >
          <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/15 group-hover:scale-110 group-active:scale-95 transition-all shadow-lg">
            <span className="text-xl text-white">ℹ️</span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 drop-shadow-md">
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
          <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/15 group-hover:scale-110 group-active:scale-95 transition-all shadow-lg">
            <span className="text-xl text-white">⬇️</span>
          </div>
          <span className="text-[11px] font-semibold text-white/90 mt-1 drop-shadow-md">
            Sauver
          </span>
        </a>
      </div>

      {/* Bottom Info Section & Playback Controls - Elevated comfortably above BottomNav */}
      <div
        className="absolute left-4 right-20 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] md:bottom-7 z-20 flex flex-col gap-2 text-white pointer-events-none"
      >
        {/* Media Type & Metadata Tag */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="px-2 py-0.5 rounded-full bg-mv-accent/80 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm shadow">
            {media.media_type}
          </span>
          {media.width && media.height && (
            <span className="text-[11px] text-white/80 drop-shadow">
              {media.width}×{media.height}
            </span>
          )}
          <span className="text-[11px] text-white/70 drop-shadow">
            • {formatFileSize(media.file_size)}
          </span>
        </div>

        {/* Filename */}
        <p className="text-sm font-semibold truncate text-white drop-shadow-md pointer-events-auto">
          {media.file_name}
        </p>

        {/* Ergonomic Video Controls Bar (⏪ -10s | Timestamp | +10s ⏩) */}
        {isVideo && (
          <div className="flex items-center gap-2 pt-0.5 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            {/* Rewind 10s Button */}
            <button
              onClick={() => seekRelative(-10)}
              className="h-8 px-3 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 text-xs font-bold text-white border border-white/20 backdrop-blur-md transition-all flex items-center gap-1.5 shadow-lg active:bg-mv-accent"
              title="Reculer de 10s"
            >
              <span className="text-xs">⏪</span>
              <span>-10s</span>
            </button>

            {/* Timestamp Badge */}
            <span className="h-8 px-3 rounded-full bg-black/60 border border-white/20 backdrop-blur-md text-xs font-mono font-bold text-white flex items-center shadow-lg">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Fast-Forward 10s Button */}
            <button
              onClick={() => seekRelative(10)}
              className="h-8 px-3 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 text-xs font-bold text-white border border-white/20 backdrop-blur-md transition-all flex items-center gap-1.5 shadow-lg active:bg-mv-accent"
              title="Avancer de 10s"
            >
              <span>+10s</span>
              <span className="text-xs">⏩</span>
            </button>
          </div>
        )}
      </div>

      {/* Prominent Video Progress Scrubber Bar - Directly above BottomNav, 100% visible */}
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
          className="absolute bottom-[calc(60px+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 h-7 z-30 flex items-center cursor-pointer group px-0"
        >
          {/* Background Scrubber Track */}
          <div className="relative w-full h-1.5 group-hover:h-3 transition-all duration-150 bg-white/30 backdrop-blur-md overflow-visible">
            {/* Glowing Filled Progress Bar */}
            <div
              className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500 relative transition-all duration-75 shadow-[0_0_12px_rgba(168,85,247,0.9)]"
              style={{ width: `${progress}%` }}
            >
              {/* Scrubbing Thumb Circle */}
              <div
                className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-xl border-2 border-violet-500 transition-all ${
                  isScrubbing
                    ? 'w-5 h-5 scale-110 ring-4 ring-violet-500/40'
                    : 'w-3 h-3 group-hover:w-4 group-hover:h-4'
                }`}
              />
            </div>

            {/* Floating Time Tooltip while scrubbing */}
            {isScrubbing && (
              <div
                className="absolute -top-9 -translate-x-1/2 bg-black/90 text-white font-mono text-xs font-bold px-2.5 py-1 rounded-md border border-white/25 pointer-events-none shadow-2xl backdrop-blur-md"
                style={{ left: `${Math.min(88, Math.max(12, progress))}%` }}
              >
                {formatTime(currentTime)} / {formatTime(duration)}
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
            className="absolute bottom-16 inset-x-4 max-w-md mx-auto z-40 bg-mv-surface/95 backdrop-blur-xl border border-mv-border p-4 rounded-2xl text-mv-text shadow-2xl"
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
