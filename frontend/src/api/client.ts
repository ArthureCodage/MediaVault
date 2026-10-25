import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

export const API_BASE_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`;

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

/**
 * Build an authenticated URL for resources that need token via query param
 * (e.g., <img> src, <video> src — can't send headers).
 */
export function getAuthenticatedUrl(path: string): string {
  const token = useAuthStore.getState().token;
  const separator = path.includes('?') ? '&' : '?';
  return `${API_BASE_URL}${path}${separator}token=${encodeURIComponent(token ?? '')}`;
}

export function getThumbnailUrl(uuid: string): string {
  return getAuthenticatedUrl(`/api/media/${uuid}/thumbnail`);
}

export function getFileUrl(uuid: string): string {
  return getAuthenticatedUrl(`/api/media/${uuid}/file`);
}

export default client;
