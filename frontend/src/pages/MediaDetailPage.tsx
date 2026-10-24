import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMediaItem, toggleFavorite, deleteMedia } from '../api/media';
import type { Media } from '../api/media';
import MediaViewer from '../components/MediaViewer';
import { useCallback } from 'react';

function MediaDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: media, isLoading, error } = useQuery({
    queryKey: ['media', 'detail', uuid],
    queryFn: () => fetchMediaItem(uuid!),
    enabled: !!uuid,
  });

  // Find adjacent items from cached lists
  const allCachedQueries = queryClient.getQueriesData<any>({ queryKey: ['media'] });
  let prevUuid: string | null = null;
  let nextUuid: string | null = null;

  for (const [_, queryData] of allCachedQueries) {
    if (queryData?.pages) {
      const items: Media[] = queryData.pages.flatMap((p: any) => p.items || []);
      const index = items.findIndex((i) => i.uuid === uuid);
      if (index !== -1) {
        if (index > 0) prevUuid = items[index - 1].uuid;
        if (index < items.length - 1) nextUuid = items[index + 1].uuid;
        break;
      }
    }
  }

  const favoriteMutation = useMutation({
    mutationFn: toggleFavorite,
    onMutate: async (uuid: string) => {
      await queryClient.cancelQueries({ queryKey: ['media', 'detail', uuid] });
      const prev = queryClient.getQueryData<Media>(['media', 'detail', uuid]);
      if (prev) {
        queryClient.setQueryData<Media>(['media', 'detail', uuid], {
          ...prev,
          is_favorite: !prev.is_favorite,
        });
      }
      return { prev };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['media'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMedia,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media'] });
      navigate('/', { replace: true });
    },
  });

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleFavoriteToggle = useCallback(
    (uuid: string) => {
      favoriteMutation.mutate(uuid);
    },
    [favoriteMutation],
  );

  const handleDelete = useCallback(
    (uuid: string) => {
      deleteMutation.mutate(uuid);
    },
    [deleteMutation],
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-mv-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !media) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-4">
        <p className="text-mv-text-secondary text-sm">Media not found</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="px-4 py-2 bg-mv-accent text-white text-sm rounded-lg hover:bg-mv-accent-hover transition-colors"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <MediaViewer
      media={media}
      prevUuid={prevUuid}
      nextUuid={nextUuid}
      onNavigate={(target) => navigate(`/media/${target}`, { replace: true })}
      onClose={handleClose}
      onFavoriteToggle={handleFavoriteToggle}
      onDelete={handleDelete}
    />
  );
}

export default MediaDetailPage;
