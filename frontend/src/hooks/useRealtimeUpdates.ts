import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export function useRealtimeUpdates() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    function connect() {
      const token = useAuthStore.getState().token;
      if (!token) return;
      // Same host as the REST API (honours VITE_API_URL), http→ws / https→wss
      const wsUrl = `${API_BASE_URL.replace(/^http/, 'ws')}/api/ws?token=${encodeURIComponent(token)}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Connected
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.event === 'MEDIA_ADDED' || payload.event === 'MEDIA_DELETED') {
              // Automatically refresh queries in real-time
              queryClient.invalidateQueries({ queryKey: ['media'] });
              queryClient.invalidateQueries({ queryKey: ['reels'] });
              queryClient.invalidateQueries({ queryKey: ['libraries'] });
              queryClient.invalidateQueries({ queryKey: ['tags'] });
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (isMounted) {
            // Reconnect after 3 seconds
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (isMounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [queryClient]);
}
