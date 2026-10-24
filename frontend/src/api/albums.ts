import client from './client';

export interface Album {
  id: number;
  name: string;
  description: string | null;
  cover_media_uuid: string | null;
  cover_thumbnail_url: string | null;
  media_count: number;
  created_at: string;
  updated_at: string;
}

export async function fetchAlbums(): Promise<Album[]> {
  const { data } = await client.get<Album[]>('/api/albums');
  return data;
}

export async function createAlbum(payload: {
  name: string;
  description?: string;
  cover_media_uuid?: string;
}): Promise<Album> {
  const { data } = await client.post<Album>('/api/albums', payload);
  return data;
}

export async function getAlbum(id: number): Promise<Album> {
  const { data } = await client.get<Album>(`/api/albums/${id}`);
  return data;
}

export async function updateAlbum(
  id: number,
  payload: { name?: string; description?: string; cover_media_uuid?: string },
): Promise<Album> {
  const { data } = await client.patch<Album>(`/api/albums/${id}`, payload);
  return data;
}

export async function deleteAlbum(id: number): Promise<void> {
  await client.delete(`/api/albums/${id}`);
}

export async function addMediaToAlbum(
  albumId: number,
  mediaUuids: string[],
): Promise<{ ok: boolean; added_count: number }> {
  const { data } = await client.post(`/api/albums/${albumId}/media`, {
    media_uuids: mediaUuids,
  });
  return data;
}

export async function removeMediaFromAlbum(
  albumId: number,
  uuid: string,
): Promise<{ ok: boolean }> {
  const { data } = await client.delete(`/api/albums/${albumId}/media/${uuid}`);
  return data;
}
