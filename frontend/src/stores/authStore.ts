import { create } from 'zustand';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('mv_token'),
  isAuthenticated: !!localStorage.getItem('mv_token'),
  setToken: (token: string) => {
    localStorage.setItem('mv_token', token);
    set({ token, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('mv_token');
    set({ token: null, isAuthenticated: false });
  },
}));
