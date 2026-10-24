import { Outlet, useLocation } from 'react-router-dom';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import UploadFAB from './UploadFAB';

function Layout() {
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const isReels = location.pathname === '/reels';

  // Listen for real-time file updates via WebSocket
  useRealtimeUpdates();

  return (
    <div className="flex min-h-screen min-h-[100dvh]">
      {isDesktop && <Sidebar />}

      <main
        className={`flex-1 ${isDesktop ? 'ml-64' : isReels ? 'pb-0' : 'pb-[60px]'}`}
      >
        <Outlet />
      </main>

      {!isDesktop && <BottomNav />}
      {!isReels && <UploadFAB />}
    </div>
  );
}

export default Layout;
