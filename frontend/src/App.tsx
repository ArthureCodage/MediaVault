import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import LoginPage from './pages/LoginPage';
import FeedPage from './pages/FeedPage';
import FavoritesPage from './pages/FavoritesPage';
import ReelsPage from './pages/ReelsPage';
import AlbumsPage from './pages/AlbumsPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import MediaDetailPage from './pages/MediaDetailPage';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<FeedPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/reels" element={<ReelsPage />} />
          <Route path="/albums" element={<AlbumsPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route
          path="/media/:uuid"
          element={
            <ProtectedRoute>
              <MediaDetailPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default App;
