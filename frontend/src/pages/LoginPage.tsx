import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { login } from '../api/media';
import { useAuthStore } from '../stores/authStore';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      if (!username.trim() || !password.trim()) {
        setError('Please enter both username and password');
        return;
      }

      setLoading(true);
      try {
        const res = await login({ username: username.trim(), password });
        setToken(res.access_token);
        navigate('/', { replace: true });
      } catch (err: any) {
        const msg =
          err?.response?.data?.detail || err?.message || 'Login failed';
        setError(typeof msg === 'string' ? msg : 'Invalid credentials');
      } finally {
        setLoading(false);
      }
    },
    [username, password, setToken, navigate],
  );

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center px-4 bg-mv-bg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="bg-mv-surface border border-mv-border rounded-xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <span className="text-5xl block mb-3">🔒</span>
            <h1 className="text-2xl font-bold text-mv-text tracking-tight">
              MediaVault
            </h1>
            <p className="text-sm text-mv-text-muted mt-1">
              Sign in to your media library
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-mv-text-secondary mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-mv-elevated border border-mv-border rounded-lg px-3.5 py-2.5 text-sm text-mv-text placeholder:text-mv-text-muted outline-none focus:border-mv-accent transition-colors"
                placeholder="Enter username"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-mv-text-secondary mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-mv-elevated border border-mv-border rounded-lg px-3.5 py-2.5 text-sm text-mv-text placeholder:text-mv-text-muted outline-none focus:border-mv-accent transition-colors"
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>

            {/* Error */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mv-accent hover:bg-mv-accent-hover disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-mv-text-muted mt-4">
          Self-hosted media vault
        </p>
      </motion.div>
    </div>
  );
}

export default LoginPage;
