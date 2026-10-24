import client from './client';

export interface Tag {
  id: number;
  name: string;
  color: string;
  media_count: number;
  created_at: string;
}

export async function fetchTags(): Promise<Tag[]> {
  const { data } = await client.get<Tag[]>('/api/tags');
  return data;
}

export async function createTag(payload: { name: string; color?: string }): Promise<Tag> {
  const { data } = await client.post<Tag>('/api/tags', payload);
  return data;
}

export async function deleteTag(id: number): Promise<void> {
  await client.delete(`/api/tags/${id}`);
}

export async function fetchMediaTags(uuid: string): Promise<Tag[]> {
  const { data } = await client.get<Tag[]>(`/api/media/${uuid}/tags`);
  return data;
}

export async function attachTagToMedia(
  uuid: string,
  payload: { tag_id?: number; name?: string; color?: string },
): Promise<Tag> {
  const { data } = await client.post<Tag>(`/api/media/${uuid}/tags`, payload);
  return data;
}

export async function detachTagFromMedia(uuid: string, tagId: number): Promise<void> {
  await client.delete(`/api/media/${uuid}/tags/${tagId}`);
}
