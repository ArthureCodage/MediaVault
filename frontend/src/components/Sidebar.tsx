import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { scanLibrary } from '../api/media';
import { useState } from 'react';

const navItems = [
  { to: '/', label: 'Feed', icon: '🏠' },
  { to: '/search', label: 'Explorer & Recherche', icon: '🔍' },
  { to: '/reels', label: 'Reels (TikTok)', icon: '🎬' },
  { to: '/albums', label: 'Albums & Collections', icon: '📁' },
  { to: '/favorites', label: 'Favoris', icon: '❤️' },
  { to: '/settings', label: 'Dossiers & Emplacements', icon: '⚙️' },
];

function Sidebar() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const scanMutation = useMutation({
    mutationFn: scanLibrary,
    onSuccess: (data) => {
      setScanMessage(data.message);
      setTimeout(() => setScanMessage(null), 3000);
    },
    onError: () => {
      setScanMessage('Scan failed');
      setTimeout(() => setScanMessage(null), 3000);
    },
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-30 w-64 bg-mv-surface border-r border-mv-border flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-mv-border shrink-0">
        <span className="text-2xl">🔒</span>
        <span className="text-xl font-bold text-mv-text tracking-tight">MediaVault</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className="block mb-1"
          >
            {({ isActive }) => (
              <motion.div
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-mv-accent/10 text-mv-accent'
                    : 'text-mv-text-secondary hover:bg-mv-hover hover:text-mv-text'
                }`}
                whileHover={{ x: 2 }}
                transition={{ duration: 0.15 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-mv-accent rounded-r"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </motion.div>
            )}
          </NavLink>
        ))}

      </nav>

      {/* Bottom actions */}
      <div className="px-3 pb-4 space-y-2 shrink-0">
        {scanMessage && (
          <p className="text-xs text-mv-accent text-center px-3 py-1">{scanMessage}</p>
        )}
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-mv-text-secondary hover:bg-mv-hover hover:text-mv-text transition-colors disabled:opacity-50"
        >
          <span className="text-lg">{scanMutation.isPending ? '⏳' : '🔄'}</span>
          <span>{scanMutation.isPending ? 'Scanning…' : 'Scan Library'}</span>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-mv-text-secondary hover:bg-red-500/10 hover:text-red-400 transition-colors"
        >
          <span className="text-lg">🚪</span>
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
