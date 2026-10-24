import client from './client';
import type { Tag } from './tags';

export interface Media {
  uuid: string;
  folder_id?: number | null;
  file_name: string;
  media_type: 'image' | 'video' | 'text';
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  is_favorite: boolean;
  thumbnail_url: string;
  file_url: string;
  file_date: string;
  created_at: string;
  tags?: Tag[];
}

export interface MediaPage {
  items: Media[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface MediaQueryParams {
  page?: number;
  per_page?: number;
  type?: string;
  folder_id?: number | null;
  tag_id?: number | null;
  album_id?: number | null;
  sort?: string;
  favorite?: boolean | string;
  q?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

// Auth
export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/api/auth/login', credentials);
  return data;
}

// Media listing
export async function fetchMedia(params: MediaQueryParams = {}): Promise<MediaPage> {
  const { data } = await client.get<MediaPage>('/api/media', { params });
  return data;
}

// Single media
export async function fetchMediaItem(uuid: string): Promise<Media> {
  const { data } = await client.get<Media>(`/api/media/${uuid}`);
  return data;
}

// Toggle favorite
export async function toggleFavorite(uuid: string): Promise<{ uuid: string; is_favorite: boolean }> {
  const { data } = await client.patch<{ uuid: string; is_favorite: boolean }>(
    `/api/media/${uuid}/favorite`,
  );
  return data;
}

// Upload
export async function uploadMedia(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<Media> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post<Media>('/api/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (e.total && onProgress) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

// Delete
export async function deleteMedia(uuid: string): Promise<void> {
  await client.delete(`/api/media/${uuid}`);
}

// Scan library
export async function scanLibrary(): Promise<{ message: string }> {
  const { data } = await client.post<{ message: string }>('/api/media/scan');
  return data;
}
