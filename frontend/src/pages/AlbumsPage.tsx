import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchAlbums, createAlbum, deleteAlbum, type Album } from '../api/albums';
import { getThumbnailUrl } from '../api/client';

export const AlbumsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [albumName, setAlbumName] = useState('');
  const [albumDesc, setAlbumDesc] = useState('');

  const { data: albums = [], isLoading } = useQuery({
    queryKey: ['albums'],
    queryFn: fetchAlbums,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) => createAlbum(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      setIsCreateOpen(false);
      setAlbumName('');
      setAlbumDesc('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAlbum(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!albumName.trim()) return;
    createMutation.mutate({
      name: albumName.trim(),
      description: albumDesc.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-mv-bg text-mv-text p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>📁</span> Albums & Collections
          </h1>
          <p className="text-sm text-mv-text-muted mt-1">
            Organise tes photos et vidéos en albums thématiques ou parcours les collections auto.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-mv-accent hover:bg-mv-accent-hover text-white text-sm font-semibold shadow-lg shadow-violet-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="text-lg">＋</span> Nouvel album
        </button>
      </div>

      {/* Smart Collections Bar */}
      <div className="mb-10">
        <h2 className="text-xs font-semibold text-mv-text-secondary uppercase tracking-wider mb-3">
          Collections Automatiques
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => navigate('/?type=image')}
            className="p-4 rounded-2xl bg-mv-surface border border-mv-border hover:border-mv-accent/50 text-left transition-all hover:scale-[1.02] group"
          >
            <span className="text-3xl block mb-2">📸</span>
            <h3 className="font-bold text-sm text-white group-hover:text-mv-accent transition-colors">
              Toutes les Photos
            </h3>
            <p className="text-xs text-mv-text-muted mt-0.5">Images & captures</p>
          </button>

          <button
            onClick={() => navigate('/?type=video')}
            className="p-4 rounded-2xl bg-mv-surface border border-mv-border hover:border-mv-accent/50 text-left transition-all hover:scale-[1.02] group"
          >
            <span className="text-3xl block mb-2">🎬</span>
            <h3 className="font-bold text-sm text-white group-hover:text-mv-accent transition-colors">
              Toutes les Vidéos
            </h3>
            <p className="text-xs text-mv-text-muted mt-0.5">Clips & enregistrements</p>
          </button>

          <button
            onClick={() => navigate('/favorites')}
            className="p-4 rounded-2xl bg-mv-surface border border-mv-border hover:border-mv-accent/50 text-left transition-all hover:scale-[1.02] group"
          >
            <span className="text-3xl block mb-2">❤️</span>
            <h3 className="font-bold text-sm text-white group-hover:text-mv-accent transition-colors">
              Mes Favoris
            </h3>
            <p className="text-xs text-mv-text-muted mt-0.5">Médias likés</p>
          </button>

          <button
            onClick={() => navigate('/?type=text')}
            className="p-4 rounded-2xl bg-mv-surface border border-mv-border hover:border-mv-accent/50 text-left transition-all hover:scale-[1.02] group"
          >
            <span className="text-3xl block mb-2">📄</span>
            <h3 className="font-bold text-sm text-white group-hover:text-mv-accent transition-colors">
              Textes & Notes
            </h3>
            <p className="text-xs text-mv-text-muted mt-0.5">Fichiers .txt</p>
          </button>
        </div>
      </div>

      {/* Manual Albums Section */}
      <div>
        <h2 className="text-xs font-semibold text-mv-text-secondary uppercase tracking-wider mb-4">
          Mes Albums Personnalisés ({albums.length})
        </h2>

        {isLoading ? (
          <div className="p-12 text-center text-mv-text-muted">Chargement des albums…</div>
        ) : albums.length === 0 ? (
          <div className="p-12 text-center bg-mv-surface border border-mv-border rounded-2xl">
            <span className="text-4xl block mb-2">📁</span>
            <p className="font-semibold text-white">Aucun album personnalisé</p>
            <p className="text-xs text-mv-text-muted mt-1 max-w-sm mx-auto">
              Crée un album pour regrouper tes meilleurs souvenirs, clips ou projets !
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-mv-accent text-white text-xs font-semibold shadow hover:bg-mv-accent-hover transition-colors"
            >
              ＋ Créer mon premier album
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {albums.map((album: Album) => {
              const coverUrl = album.cover_media_uuid
                ? getThumbnailUrl(album.cover_media_uuid)
                : null;

              return (
                <div
                  key={album.id}
                  onClick={() => navigate(`/?album_id=${album.id}`)}
                  className="group relative bg-mv-surface border border-mv-border rounded-2xl overflow-hidden cursor-pointer hover:border-mv-accent/60 transition-all shadow-md hover:shadow-violet-500/10 flex flex-col"
                >
                  {/* Cover */}
                  <div className="relative aspect-square w-full bg-mv-elevated overflow-hidden flex items-center justify-center">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={album.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <span className="text-5xl opacity-40 group-hover:scale-110 transition-transform">
                        📁
                      </span>
                    )}

                    {/* Badge count */}
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white">
                      {album.media_count} médias
                    </div>

                    {/* Delete button on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Supprimer l'album "${album.name}" ? (Tes médias ne seront pas effacés).`)) {
                          deleteMutation.mutate(album.id);
                        }
                      }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md text-white/80 hover:text-rose-400 hover:bg-black/90 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Supprimer l'album"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* Album info */}
                  <div className="p-3">
                    <h3 className="font-bold text-sm text-white truncate group-hover:text-mv-accent transition-colors">
                      {album.name}
                    </h3>
                    {album.description && (
                      <p className="text-[11px] text-mv-text-muted truncate mt-0.5">
                        {album.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Album Modal */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-mv-surface border border-mv-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>📁</span> Créer un album
                </h2>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="w-7 h-7 rounded-full bg-mv-elevated hover:bg-mv-hover text-white flex items-center justify-center text-sm"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-mv-text-secondary uppercase tracking-wider mb-1.5">
                    Nom de l'album
                  </label>
                  <input
                    type="text"
                    value={albumName}
                    onChange={(e) => setAlbumName(e.target.value)}
                    placeholder="Ex: Vacances été, Highlights gaming..."
                    className="w-full bg-mv-elevated border border-mv-border rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-mv-accent"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-mv-text-secondary uppercase tracking-wider mb-1.5">
                    Description (optionnel)
                  </label>
                  <textarea
                    value={albumDesc}
                    onChange={(e) => setAlbumDesc(e.target.value)}
                    placeholder="Courte description de l'album..."
                    rows={2}
                    className="w-full bg-mv-elevated border border-mv-border rounded-xl px-3.5 py-2 text-sm text-white outline-none focus:border-mv-accent resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-mv-border">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 rounded-xl bg-mv-elevated hover:bg-mv-hover text-xs font-semibold text-mv-text-secondary transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || !albumName.trim()}
                    className="px-5 py-2 rounded-xl bg-mv-accent hover:bg-mv-accent-hover text-white text-xs font-semibold shadow-lg shadow-violet-500/25 transition-all disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Création…' : 'Créer l’album'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AlbumsPage;
