import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Notification } from '../types/database';
import { useApp } from '../context/AppContext';

export function useNotifications() {
  const queryClient = useQueryClient();
  const { currentUser } = useApp();

  // 1. Query all notifications for the current user (across workspaces, including invitations)
  const { data: notifications = [], isLoading, error } = useQuery({
    queryKey: ['notifications', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', currentUser.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Hydrate actor profiles from public.profiles
      const actorIds = Array.from(new Set(data.map(n => n.actor_id).filter(Boolean))) as string[];
      let profiles: any[] = [];
      if (actorIds.length > 0) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', actorIds);
        profiles = pData || [];
      }

      return data.map(n => ({
        ...n,
        actor: profiles.find(p => p.id === n.actor_id) || null
      })) as Notification[];
    },
    enabled: !!currentUser?.id,
    refetchInterval: 3000, // Instant polling fallback every 3s
  });

  // 2. Realtime WebSocket subscription for instant notification delivery
  useEffect(() => {
    if (!currentUser?.id) return;

    const channelName = `notifs_${currentUser.id}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUser.id}`
        },
        () => {
          // Immediately invalidate and refetch on any notification insert/update
          queryClient.invalidateQueries({ queryKey: ['notifications', currentUser.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, queryClient]);

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data as Notification;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) throw new Error('Missing context');

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', currentUser.id);
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const removeNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  return {
    notifications,
    isLoading,
    error,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    removeNotification: removeNotificationMutation.mutate
  };
}
