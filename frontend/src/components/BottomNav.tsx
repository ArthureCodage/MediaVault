import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

const navItems = [
  { to: '/', label: 'Feed', icon: '🏠' },
  { to: '/search', label: 'Explorer', icon: '🔍' },
  { to: '/reels', label: 'Reels', icon: '🎬' },
  { to: '/albums', label: 'Albums', icon: '📁' },
  { to: '/settings', label: 'Dossiers', icon: '⚙️' },
];

function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-[calc(60px+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] bg-mv-surface border-t border-mv-border">
      <div className="flex items-center justify-around h-[60px] max-w-lg mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className="relative flex flex-col items-center justify-center flex-1 h-full"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="bottomnav-indicator"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-mv-accent rounded-b"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="text-xl leading-none">{item.icon}</span>
                <span
                  className={`text-[10px] mt-1 font-medium transition-colors ${
                    isActive ? 'text-mv-accent' : 'text-mv-text-secondary'
                  }`}
                >
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default BottomNav;
