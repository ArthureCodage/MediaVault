import client from './client';

export interface LibraryFolder {
  id: number;
  name: string;
  path: string;
  is_enabled: boolean;
  exists_on_disk: boolean;
  total_items: number;
  images_count: number;
  videos_count: number;
  texts_count: number;
  created_at: string;
  last_scanned_at: string | null;
}

export interface DirectoryBrowseResponse {
  current_path: string;
  parent_path: string | null;
  drives: string[];
  directories: string[];
}

export async function fetchLibraries(): Promise<LibraryFolder[]> {
  const { data } = await client.get<LibraryFolder[]>('/api/libraries');
  return data;
}

export async function addLibrary(payload: { name: string; path: string }): Promise<LibraryFolder> {
  const { data } = await client.post<LibraryFolder>('/api/libraries', payload);
  return data;
}

export async function updateLibrary(
  id: number,
  payload: { name?: string; is_enabled?: boolean },
): Promise<LibraryFolder> {
  const { data } = await client.patch<LibraryFolder>(`/api/libraries/${id}`, payload);
  return data;
}

export async function deleteLibrary(id: number, deleteMedia: boolean = true): Promise<void> {
  await client.delete(`/api/libraries/${id}`, { params: { delete_media: deleteMedia } });
}

export async function scanLibraryFolder(id: number): Promise<{ new_files: number; removed_entries: number; total: number }> {
  const { data } = await client.post(`/api/libraries/${id}/scan`);
  return data;
}

export async function browseDirectory(path?: string): Promise<DirectoryBrowseResponse> {
  const { data } = await client.get<DirectoryBrowseResponse>('/api/libraries/browse', {
    params: path ? { path } : undefined,
  });
  return data;
}
