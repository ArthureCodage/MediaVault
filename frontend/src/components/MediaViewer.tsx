import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Media } from '../api/media';
import { getFileUrl } from '../api/client';
import { fetchTags, fetchMediaTags, attachTagToMedia, detachTagFromMedia, type Tag } from '../api/tags';
import { fetchAlbums, addMediaToAlbum, type Album } from '../api/albums';
import { useCallback, useEffect, useState, useRef } from 'react';

interface MediaViewerProps {
  media: Media;
  prevUuid?: string | null;
  nextUuid?: string | null;
  onNavigate?: (uuid: string) => void;
  onClose: () => void;
  onFavoriteToggle: (uuid: string) => void;
  onDelete: (uuid: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MediaViewer({
  media,
  prevUuid,
  nextUuid,
  onNavigate,
  onClose,
  onFavoriteToggle,
  onDelete,
}: MediaViewerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileUrl = getFileUrl(media.uuid);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Touch gesture tracking for swipe navigation
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Tags & Album popover state
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [showAlbumPopover, setShowAlbumPopover] = useState(false);
  const [albumNotice, setAlbumNotice] = useState<string | null>(null);

  // Queries
  const { data: mediaTags = [] } = useQuery({
    queryKey: ['media-tags', media.uuid],
    queryFn: () => fetchMediaTags(media.uuid),
  });

  const { data: allAlbums = [] } = useQuery({
    queryKey: ['albums'],
    queryFn: fetchAlbums,
    enabled: showAlbumPopover,
  });

  // Tag mutations
  const attachTagMutation = useMutation({
    mutationFn: (payload: { tag_id?: number; name?: string; color?: string }) =>
      attachTagToMedia(media.uuid, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-tags', media.uuid] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setNewTagName('');
    },
  });

  const detachTagMutation = useMutation({
    mutationFn: (tagId: number) => detachTagFromMedia(media.uuid, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-tags', media.uuid] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  // Album mutation
  const addToAlbumMutation = useMutation({
    mutationFn: (albumId: number) => addMediaToAlbum(albumId, [media.uuid]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      setAlbumNotice('Ajouté à l’album !');
      setTimeout(() => {
        setAlbumNotice(null);
        setShowAlbumPopover(false);
      }, 1500);
    },
  });

  // Keyboard navigation: ESC, Left, Right
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && prevUuid && onNavigate) {
        onNavigate(prevUuid);
      } else if (e.key === 'ArrowRight' && nextUuid && onNavigate) {
        onNavigate(nextUuid);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prevUuid, nextUuid, onNavigate]);

  // Touch Swipe Handlers (Swipe left/right to change media, swipe down to close)
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Minimum distance for swipe threshold
    const MIN_SWIPE_DISTANCE = 60;

    // Horizontal swipe
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > MIN_SWIPE_DISTANCE) {
      if (deltaX < 0 && nextUuid && onNavigate) {
        onNavigate(nextUuid); // Swipe left → next
      } else if (deltaX > 0 && prevUuid && onNavigate) {
        onNavigate(prevUuid); // Swipe right → prev
      }
    }
    // Vertical swipe down to close
    else if (deltaY > MIN_SWIPE_DISTANCE * 1.5 && Math.abs(deltaX) < 40) {
      onClose();
    }
  };

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Fetch text content
  useEffect(() => {
    if (media.media_type === 'text') {
      fetch(fileUrl)
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent('Impossible de lire le fichier texte.'));
    }
  }, [media.media_type, fileUrl]);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(media.uuid);
    navigate(-1);
  }, [confirmDelete, onDelete, media.uuid, navigate]);

  const handleDownload = useCallback(() => {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = media.file_name;
    a.click();
  }, [fileUrl, media.file_name]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-md z-20">
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white text-lg"
          title="Fermer"
        >
          ✕
        </button>
        <h2 className="text-sm font-medium text-white/90 truncate max-w-[50%]">
          {media.file_name}
        </h2>
        <div className="flex items-center gap-2">
          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white text-xs"
            title="Plein écran"
          >
            ⛶
          </button>
          {/* Add to Album Button */}
          <button
            onClick={() => setShowAlbumPopover(!showAlbumPopover)}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
            title="Ajouter à un album"
          >
            <span>📁</span>
            <span className="hidden sm:inline">Album</span>
          </button>
        </div>
      </div>

      {/* Floating Prev / Next Arrow buttons on Desktop */}
      {prevUuid && onNavigate && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(prevUuid);
          }}
          className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/10 text-white items-center justify-center text-xl transition-all hover:scale-110 active:scale-95"
          title="Précédent (←)"
        >
          ❮
        </button>
      )}

      {nextUuid && onNavigate && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(nextUuid);
          }}
          className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/10 text-white items-center justify-center text-xl transition-all hover:scale-110 active:scale-95"
          title="Suivant (→)"
        >
          ❯
        </button>
      )}

      {/* Media content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0 px-2 relative select-none">
        <AnimatePresence mode="wait">
          {media.media_type === 'image' && (
            <motion.img
              key={`img-${media.uuid}`}
              src={fileUrl}
              alt={media.file_name}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{
                scale: isZoomed ? 2 : 1,
                opacity: 1,
              }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onDoubleClick={() => setIsZoomed((z) => !z)}
              className={`max-w-full max-h-full object-contain rounded-lg transition-transform duration-200 cursor-${
                isZoomed ? 'zoom-out' : 'zoom-in'
              }`}
              draggable={false}
            />
          )}

          {media.media_type === 'video' && (
            <motion.video
              key={`vid-${media.uuid}`}
              src={fileUrl}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="max-w-full max-h-full rounded-lg"
              controls
              autoPlay
              playsInline
            />
          )}

          {media.media_type === 'text' && (
            <motion.div
              key={`txt-${media.uuid}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-3xl max-h-full overflow-auto bg-mv-surface rounded-xl p-6"
            >
              <pre className="text-sm font-mono text-mv-text whitespace-pre-wrap break-words leading-relaxed">
                {textContent ?? 'Chargement…'}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Album Popover Modal */}
      <AnimatePresence>
        {showAlbumPopover && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-mv-surface border border-mv-border rounded-2xl w-full max-w-xs p-5 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-sm text-white">Ajouter à un album</h3>
                <button
                  onClick={() => setShowAlbumPopover(false)}
                  className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs"
                >
                  ✕
                </button>
              </div>

              {albumNotice && (
                <p className="text-xs text-emerald-400 font-semibold mb-2 bg-emerald-400/10 p-2 rounded-lg">
                  {albumNotice}
                </p>
              )}

              <div className="max-h-48 overflow-y-auto space-y-1.5 mb-3">
                {allAlbums.length === 0 ? (
                  <p className="text-xs text-mv-text-muted py-2">
                    Aucun album créé. Va dans l'onglet Albums pour en créer un !
                  </p>
                ) : (
                  allAlbums.map((a: Album) => (
                    <button
                      key={a.id}
                      onClick={() => addToAlbumMutation.mutate(a.id)}
                      disabled={addToAlbumMutation.isPending}
                      className="w-full text-left px-3 py-2 rounded-xl bg-mv-elevated hover:bg-mv-accent hover:text-white text-xs font-medium text-white transition-colors flex items-center justify-between"
                    >
                      <span className="truncate">{a.name}</span>
                      <span className="text-[10px] opacity-60">＋</span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom bar with Info & Tags */}
      <div className="shrink-0 bg-mv-surface/90 backdrop-blur-md border-t border-mv-border px-4 py-3 safe-bottom z-20">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Tags list & Add Tag */}
          <div className="flex flex-wrap items-center gap-1.5">
            {mediaTags.map((tag: Tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white shadow-sm"
                style={{ backgroundColor: tag.color || '#8b5cf6' }}
              >
                <span>#{tag.name}</span>
                <button
                  onClick={() => detachTagMutation.mutate(tag.id)}
                  className="hover:opacity-75 ml-0.5 text-[9px]"
                  title="Retirer le tag"
                >
                  ✕
                </button>
              </span>
            ))}

            {/* Tag Button / Input */}
            <div className="relative">
              {!showTagPopover ? (
                <button
                  onClick={() => setShowTagPopover(true)}
                  className="px-2.5 py-0.5 rounded-full bg-mv-elevated hover:bg-mv-hover border border-mv-border text-[11px] font-medium text-mv-text-secondary hover:text-white transition-colors"
                >
                  ＋ Tag
                </button>
              ) : (
                <div className="flex items-center gap-1 bg-mv-elevated border border-mv-accent rounded-full px-2 py-0.5">
                  <span className="text-xs text-mv-text-muted">#</span>
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Nom du tag..."
                    className="w-24 bg-transparent text-xs text-white outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTagName.trim()) {
                        attachTagMutation.mutate({ name: newTagName.trim() });
                        setShowTagPopover(false);
                      } else if (e.key === 'Escape') {
                        setShowTagPopover(false);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newTagName.trim()) {
                        attachTagMutation.mutate({ name: newTagName.trim() });
                      }
                      setShowTagPopover(false);
                    }}
                    className="text-xs text-mv-accent hover:text-white font-bold"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setShowTagPopover(false)}
                    className="text-[10px] text-mv-text-muted hover:text-white ml-0.5"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Details & Actions row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-xs text-mv-text-secondary truncate">
                {formatDate(media.file_date)} · {formatFileSize(media.file_size)}
                {media.width && media.height ? ` · ${media.width}×${media.height}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onFavoriteToggle(media.uuid)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-lg"
                title="Favori"
              >
                {media.is_favorite ? '❤️' : '🤍'}
              </button>
              <button
                onClick={handleDownload}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-lg"
                title="Télécharger"
              >
                ⬇️
              </button>
              <button
                onClick={handleDelete}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors text-lg ${
                  confirmDelete
                    ? 'bg-red-500/20 hover:bg-red-500/30'
                    : 'hover:bg-white/10'
                }`}
                title={confirmDelete ? 'Cliquer à nouveau pour confirmer' : 'Supprimer'}
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default MediaViewer;
