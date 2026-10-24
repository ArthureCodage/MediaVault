import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { fetchLibraries, type LibraryFolder } from '../api/libraries';

interface FilterBarProps {
  activeType: string;
  onTypeChange: (type: string) => void;
  activeFolderId?: number | null;
  onFolderChange?: (folderId: number | null) => void;
  activeSort: string;
  onSortChange: (sort: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const typeFilters = [
  { value: '', label: 'All' },
  { value: 'image', label: '📷 Photos' },
  { value: 'video', label: '🎬 Videos' },
  { value: 'text', label: '📄 Texts' },
];

const sortOptions = [
  { value: 'date_desc', label: 'Newest First' },
  { value: 'date_asc', label: 'Oldest First' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'size_desc', label: 'Largest First' },
  { value: 'size_asc', label: 'Smallest First' },
];

function FilterBar({
  activeType,
  onTypeChange,
  activeFolderId = null,
  onFolderChange,
  activeSort,
  onSortChange,
  searchQuery,
  onSearchChange,
}: FilterBarProps) {
  const [showSort, setShowSort] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: libraries = [] } = useQuery({
    queryKey: ['libraries'],
    queryFn: fetchLibraries,
  });

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSort(false);
      }
      if (folderRef.current && !folderRef.current.contains(e.target as Node)) {
        setShowFolderMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search when opened
  useEffect(() => {
    if (showSearch && searchRef.current) {
      searchRef.current.focus();
    }
  }, [showSearch]);

  return (
    <div className="sticky top-0 z-20 bg-mv-bg/95 backdrop-blur-sm border-b border-mv-border">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Library / Folder selector if multiple folders exist */}
        {libraries.length > 1 && onFolderChange && (
          <div ref={folderRef} className="relative shrink-0">
            <button
              onClick={() => setShowFolderMenu(!showFolderMenu)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                activeFolderId != null
                  ? 'bg-mv-accent text-white border-mv-accent shadow-sm'
                  : 'bg-mv-surface text-mv-text-secondary border-mv-border hover:bg-mv-hover'
              }`}
            >
              <span>📁</span>
              <span className="max-w-[100px] truncate">
                {activeFolderId == null
                  ? 'Toutes'
                  : libraries.find((l: LibraryFolder) => l.id === activeFolderId)?.name || 'Dossier'}
              </span>
              <span className="text-[10px]">▼</span>
            </button>

            <AnimatePresence>
              {showFolderMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  className="absolute left-0 top-full mt-1.5 w-52 bg-mv-elevated border border-mv-border rounded-xl shadow-2xl overflow-hidden z-30"
                >
                  <button
                    onClick={() => {
                      onFolderChange(null);
                      setShowFolderMenu(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 text-xs font-medium border-b border-mv-border/50 transition-colors ${
                      activeFolderId == null ? 'bg-mv-accent/10 text-mv-accent' : 'text-white hover:bg-mv-hover'
                    }`}
                  >
                    🌐 Tous les emplacements
                  </button>
                  {libraries.map((lib: LibraryFolder) => (
                    <button
                      key={lib.id}
                      onClick={() => {
                        onFolderChange(lib.id);
                        setShowFolderMenu(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs font-medium transition-colors truncate flex items-center justify-between ${
                        activeFolderId === lib.id ? 'bg-mv-accent/10 text-mv-accent' : 'text-white hover:bg-mv-hover'
                      }`}
                    >
                      <span className="truncate">{lib.name}</span>
                      <span className="text-[10px] text-mv-text-muted shrink-0 ml-2">
                        {lib.total_items}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Type filter tabs */}
        <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => onTypeChange(filter.value)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeType === filter.value
                  ? 'bg-mv-accent text-white'
                  : 'bg-mv-surface text-mv-text-secondary hover:bg-mv-hover hover:text-mv-text'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Search toggle */}
        <button
          onClick={() => {
            setShowSearch(!showSearch);
            if (showSearch) onSearchChange('');
          }}
          className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
            showSearch
              ? 'bg-mv-accent text-white'
              : 'text-mv-text-secondary hover:bg-mv-hover hover:text-mv-text'
          }`}
        >
          🔍
        </button>

        {/* Sort dropdown */}
        <div ref={sortRef} className="relative shrink-0">
          <button
            onClick={() => setShowSort(!showSort)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
              showSort
                ? 'bg-mv-accent text-white'
                : 'text-mv-text-secondary hover:bg-mv-hover hover:text-mv-text'
            }`}
          >
            ↕️
          </button>
          <AnimatePresence>
            {showSort && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1 w-44 bg-mv-elevated border border-mv-border rounded-xl shadow-xl overflow-hidden"
              >
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setShowSort(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-xs font-medium transition-colors ${
                      activeSort === option.value
                        ? 'bg-mv-accent/10 text-mv-accent'
                        : 'text-mv-text-secondary hover:bg-mv-hover hover:text-mv-text'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Expandable search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5">
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search files…"
                className="w-full bg-mv-surface border border-mv-border rounded-lg px-3 py-2 text-sm text-mv-text placeholder:text-mv-text-muted outline-none focus:border-mv-accent transition-colors"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FilterBar;
