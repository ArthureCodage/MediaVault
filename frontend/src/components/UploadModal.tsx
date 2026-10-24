import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadMedia } from '../api/media';

interface UploadModalProps {
  onClose: () => void;
}

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

function UploadModal({ onClose }: UploadModalProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // ESC to close (only if not uploading)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !uploading) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, uploading]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const additions: UploadFile[] = Array.from(newFiles).map((f) => ({
      file: f,
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...additions]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleUploadAll = useCallback(async () => {
    if (files.length === 0) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const uf = files[i];
      if (uf.status !== 'pending') continue;

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uf.id ? { ...f, status: 'uploading' as const } : f,
        ),
      );

      try {
        await uploadMedia(uf.file, (progress) => {
          setFiles((prev) =>
            prev.map((f) => (f.id === uf.id ? { ...f, progress } : f)),
          );
        });
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uf.id ? { ...f, status: 'done' as const, progress: 100 } : f,
          ),
        );
      } catch (err: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uf.id
              ? { ...f, status: 'error' as const, error: err?.message || 'Upload failed' }
              : f,
          ),
        );
      }
    }

    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ['media'] });
  }, [files, queryClient]);

  const allDone = files.length > 0 && files.every((f) => f.status === 'done' || f.status === 'error');
  const hasPending = files.some((f) => f.status === 'pending');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={uploading ? undefined : onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-mv-elevated rounded-xl border border-mv-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-mv-border">
          <h2 className="text-lg font-semibold text-mv-text">Upload Files</h2>
          {!uploading && (
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-mv-text-secondary hover:bg-mv-hover hover:text-mv-text transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Drop zone */}
        <div className="p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl py-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
              dragging
                ? 'border-mv-accent bg-mv-accent/5'
                : 'border-mv-border hover:border-mv-text-muted'
            }`}
          >
            <span className="text-4xl mb-3">📁</span>
            <p className="text-sm text-mv-text font-medium">
              {dragging ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-xs text-mv-text-muted mt-1">or click to browse</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,.txt,.md,.json,.log,.csv"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="px-5 pb-3 max-h-48 overflow-auto">
            <AnimatePresence>
              {files.map((uf) => (
                <motion.div
                  key={uf.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 py-2 border-b border-mv-border/50 last:border-0"
                >
                  <span className="text-sm shrink-0">
                    {uf.status === 'done'
                      ? '✅'
                      : uf.status === 'error'
                        ? '❌'
                        : uf.status === 'uploading'
                          ? '⏳'
                          : '📎'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-mv-text truncate">{uf.file.name}</p>
                    {uf.status === 'uploading' && (
                      <div className="mt-1 h-1 bg-mv-border rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-mv-accent rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${uf.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                    {uf.status === 'error' && (
                      <p className="text-[10px] text-red-400 mt-0.5">{uf.error}</p>
                    )}
                  </div>
                  {uf.status === 'pending' && (
                    <button
                      onClick={() => removeFile(uf.id)}
                      className="text-mv-text-muted hover:text-mv-text text-xs shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 border-t border-mv-border flex justify-end gap-2">
          {allDone ? (
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-mv-accent hover:bg-mv-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              {!uploading && (
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-sm font-medium text-mv-text-secondary hover:text-mv-text transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleUploadAll}
                disabled={!hasPending || uploading}
                className="px-5 py-2.5 bg-mv-accent hover:bg-mv-accent-hover disabled:opacity-50 disabled:hover:bg-mv-accent text-white text-sm font-medium rounded-lg transition-colors"
              >
                {uploading ? 'Uploading…' : `Upload (${files.filter((f) => f.status === 'pending').length})`}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default UploadModal;
