import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchLibraries,
  addLibrary,
  deleteLibrary,
  scanLibraryFolder,
  browseDirectory,
  type LibraryFolder,
} from '../api/libraries';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState<string>('');
  const [libraryName, setLibraryName] = useState<string>('');
  const [manualPath, setManualPath] = useState<string>('');
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch libraries
  const { data: libraries = [], isLoading } = useQuery({
    queryKey: ['libraries'],
    queryFn: fetchLibraries,
  });

  // Browse directory query
  const { data: browseData, isLoading: isBrowsing } = useQuery({
    queryKey: ['browse', browsePath],
    queryFn: () => browseDirectory(browsePath),
    enabled: isAddModalOpen,
  });

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: (id: number) => {
      setScanningId(id);
      return scanLibraryFolder(id);
    },
    onSuccess: (res) => {
      setScanningId(null);
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      queryClient.invalidateQueries({ queryKey: ['media'] });
      setStatusMessage(`Scan terminé : +${res.new_files} nouveaux, ${res.total} total`);
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: () => {
      setScanningId(null);
      setStatusMessage('Erreur lors du scan.');
      setTimeout(() => setStatusMessage(null), 4000);
    },
  });

  // Add library mutation
  const addMutation = useMutation({
    mutationFn: (payload: { name: string; path: string }) => addLibrary(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      queryClient.invalidateQueries({ queryKey: ['media'] });
      setIsAddModalOpen(false);
      setManualPath('');
      setLibraryName('');
      setStatusMessage('Nouvel emplacement ajouté avec succès !');
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Erreur lors de l’ajout du dossier.';
      alert(msg);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteLibrary(id, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      queryClient.invalidateQueries({ queryKey: ['media'] });
      setStatusMessage('Emplacement retiré.');
      setTimeout(() => setStatusMessage(null), 3000);
    },
  });

  const handleOpenAdd = () => {
    setIsAddModalOpen(true);
    setBrowsePath('');
    setManualPath('');
    setLibraryName('');
  };

  const handleSelectFolder = (folderName: string) => {
    if (!browseData) return;
    const separator = browseData.current_path.endsWith('\\') || browseData.current_path.endsWith('/') ? '' : '\\';
    const newPath = `${browseData.current_path}${separator}${folderName}`;
    setBrowsePath(newPath);
    setManualPath(newPath);
    if (!libraryName) {
      setLibraryName(folderName);
    }
  };

  const handleDriveClick = (drive: string) => {
    setBrowsePath(drive);
    setManualPath(drive);
  };

  const handleParentClick = () => {
    if (browseData?.parent_path) {
      setBrowsePath(browseData.parent_path);
      setManualPath(browseData.parent_path);
    }
  };

  const handleConfirmAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPath = manualPath.trim() || browseData?.current_path || '';
    if (!finalPath) return;

    let finalName = libraryName.trim();
    if (!finalName) {
      const parts = finalPath.replace(/[/\\]+$/, '').split(/[/\\]/);
      finalName = parts[parts.length - 1] || 'Bibliothèque';
    }

    addMutation.mutate({ name: finalName, path: finalPath });
  };

  return (
    <div className="min-h-screen bg-mv-bg text-mv-text p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>📁</span> Emplacements & Bibliothèques
          </h1>
          <p className="text-sm text-mv-text-muted mt-1">
            Gère tes dossiers multimédias sur ton PC ou ton homelab (façon Plex / Jellyfin).
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-mv-accent hover:bg-mv-accent-hover text-white text-sm font-semibold shadow-lg shadow-violet-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="text-lg">＋</span> Ajouter un dossier
        </button>
      </div>

      {/* Status banner */}
      <AnimatePresence>
        {statusMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-3.5 rounded-xl bg-mv-accent/15 border border-mv-accent/30 text-mv-accent text-sm font-medium flex items-center gap-2"
          >
            <span>ℹ️</span> {statusMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Libraries List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-mv-text-muted">Chargement des emplacements…</div>
        ) : libraries.length === 0 ? (
          <div className="p-12 text-center bg-mv-surface border border-mv-border rounded-2xl">
            <span className="text-4xl block mb-2">📂</span>
            <p className="font-semibold text-white">Aucun emplacement configuré</p>
            <p className="text-xs text-mv-text-muted mt-1">
              Ajoute un dossier sur ton PC (ex: D:\Videos, C:\Users\DonoM\Pictures).
            </p>
          </div>
        ) : (
          libraries.map((lib: LibraryFolder) => (
            <div
              key={lib.id}
              className="bg-mv-surface border border-mv-border rounded-2xl p-5 hover:border-mv-border/80 transition-all shadow-sm"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Left info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">
                      {lib.videos_count > lib.images_count ? '🎬' : '🖼️'}
                    </span>
                    <h3 className="font-bold text-base text-white truncate">{lib.name}</h3>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        lib.exists_on_disk
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${lib.exists_on_disk ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      {lib.exists_on_disk ? 'Accessible' : 'Introuvable'}
                    </span>
                  </div>

                  {/* Path */}
                  <p className="text-xs font-mono text-mv-text-muted mt-1 truncate bg-black/30 px-2 py-1 rounded inline-block max-w-full">
                    {lib.path}
                  </p>

                  {/* Badges / Stats */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                    <span className="bg-mv-elevated px-2.5 py-1 rounded-lg text-white font-medium border border-mv-border">
                      📊 {lib.total_items} fichiers
                    </span>
                    <span className="bg-mv-elevated px-2.5 py-1 rounded-lg text-mv-text-secondary border border-mv-border">
                      📷 {lib.images_count} photos
                    </span>
                    <span className="bg-mv-elevated px-2.5 py-1 rounded-lg text-mv-text-secondary border border-mv-border">
                      🎬 {lib.videos_count} vidéos
                    </span>
                    {lib.texts_count > 0 && (
                      <span className="bg-mv-elevated px-2.5 py-1 rounded-lg text-mv-text-secondary border border-mv-border">
                        📄 {lib.texts_count} textes
                      </span>
                    )}
                    {lib.last_scanned_at && (
                      <span className="text-[11px] text-mv-text-muted ml-auto">
                        Dernier scan : {new Date(lib.last_scanned_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right action buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => scanMutation.mutate(lib.id)}
                    disabled={scanningId === lib.id}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-mv-elevated hover:bg-mv-hover border border-mv-border text-xs font-medium text-white transition-all disabled:opacity-50"
                    title="Lancer un scan de ce dossier"
                  >
                    <span className={scanningId === lib.id ? 'animate-spin' : ''}>🔄</span>
                    <span>{scanningId === lib.id ? 'Scan en cours…' : 'Scanner'}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`Supprimer l'emplacement "${lib.name}" de MediaVault ? (Les fichiers sur ton disque ne seront pas effacés).`)) {
                        deleteMutation.mutate(lib.id);
                      }
                    }}
                    className="p-2 rounded-xl bg-mv-elevated hover:bg-rose-500/10 hover:text-rose-400 border border-mv-border text-mv-text-muted text-xs transition-colors"
                    title="Supprimer cet emplacement"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Library Modal (Folder Browser like Plex/Jellyfin) */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-mv-surface border border-mv-border rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-mv-border">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📁</span>
                  <h2 className="text-lg font-bold text-white">Ajouter un dossier de médias</h2>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-mv-elevated hover:bg-mv-hover text-white flex items-center justify-center text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleConfirmAdd} className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Drive shortcuts */}
                {browseData?.drives && browseData.drives.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-mv-text-secondary uppercase tracking-wider mb-2">
                      Lecteurs & Disques détectés
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {browseData.drives.map((drive) => (
                        <button
                          key={drive}
                          type="button"
                          onClick={() => handleDriveClick(drive)}
                          className="px-3 py-1.5 rounded-lg bg-mv-elevated hover:bg-mv-accent hover:text-white border border-mv-border text-xs font-mono font-bold transition-colors"
                        >
                          💾 {drive}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Path input */}
                <div>
                  <label className="block text-xs font-semibold text-mv-text-secondary uppercase tracking-wider mb-1.5">
                    Chemin du dossier sur le serveur
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualPath || browseData?.current_path || ''}
                      onChange={(e) => {
                        setManualPath(e.target.value);
                        setBrowsePath(e.target.value);
                      }}
                      placeholder="Ex: D:\Videos ou C:\Users\DonoM\Pictures"
                      className="flex-1 bg-mv-elevated border border-mv-border rounded-xl px-3.5 py-2 text-xs font-mono text-white outline-none focus:border-mv-accent"
                    />
                    {browseData?.parent_path && (
                      <button
                        type="button"
                        onClick={handleParentClick}
                        className="px-3 py-2 rounded-xl bg-mv-elevated hover:bg-mv-hover border border-mv-border text-xs font-medium text-white shrink-0"
                        title="Dossier parent"
                      >
                        ⬆️ Parent
                      </button>
                    )}
                  </div>
                </div>

                {/* Subdirectories explorer */}
                <div>
                  <label className="block text-xs font-semibold text-mv-text-secondary uppercase tracking-wider mb-1.5">
                    Sous-dossiers dans <span className="text-white font-mono">{browseData?.current_path}</span>
                  </label>
                  <div className="h-44 overflow-y-auto bg-mv-elevated/70 border border-mv-border rounded-xl p-2 space-y-1">
                    {isBrowsing ? (
                      <p className="text-xs text-mv-text-muted p-2">Lecture du dossier…</p>
                    ) : browseData?.directories && browseData.directories.length > 0 ? (
                      browseData.directories.map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => handleSelectFolder(dir)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-mv-accent/20 hover:text-white text-xs text-mv-text-secondary flex items-center gap-2 group transition-colors"
                        >
                          <span>📁</span>
                          <span className="font-medium group-hover:text-white truncate">{dir}</span>
                          <span className="ml-auto text-[10px] text-mv-text-muted group-hover:text-mv-accent">Entrer ➔</span>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-mv-text-muted p-4 text-center">
                        Aucun sous-dossier ou accès restreint.
                      </p>
                    )}
                  </div>
                </div>

                {/* Library Name */}
                <div>
                  <label className="block text-xs font-semibold text-mv-text-secondary uppercase tracking-wider mb-1.5">
                    Nom d'affichage dans MediaVault
                  </label>
                  <input
                    type="text"
                    value={libraryName}
                    onChange={(e) => setLibraryName(e.target.value)}
                    placeholder="Ex: Mes Vidéos, Photos Vacances, Disque D..."
                    className="w-full bg-mv-elevated border border-mv-border rounded-xl px-3.5 py-2 text-sm text-white outline-none focus:border-mv-accent"
                  />
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-mv-border">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-mv-elevated hover:bg-mv-hover text-xs font-semibold text-mv-text-secondary transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={addMutation.isPending}
                    className="px-5 py-2 rounded-xl bg-mv-accent hover:bg-mv-accent-hover text-white text-xs font-semibold shadow-lg shadow-violet-500/25 transition-all disabled:opacity-50"
                  >
                    {addMutation.isPending ? 'Ajout et scan…' : 'Ajouter & Scanner'}
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

export default SettingsPage;
