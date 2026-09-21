import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { TicketComment } from '../types/database';
import { useApp } from '../context/AppContext';

export function useComments(ticketId?: string) {
  const queryClient = useQueryClient();
  const { currentWorkspace, currentUser } = useApp();

  const { data: comments, isLoading, error } = useQuery({
    queryKey: ['comments', ticketId],
    queryFn: async () => {
      if (!ticketId) return [];

      const { data, error } = await supabase
        .from('ticket_comments')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Hydrate authors from profiles
      const authorIds = Array.from(new Set(data.map(c => c.author_id).filter(Boolean))) as string[];
      let profiles: any[] = [];
      if (authorIds.length > 0) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', authorIds);
        profiles = pData || [];
      }

      return data.map(c => ({
        ...c,
        author: profiles.find(p => p.id === c.author_id) || null
      })) as TicketComment[];
    },
    enabled: !!ticketId
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ body, mentionedUserIds }: { body: string; mentionedUserIds?: string[] }) => {
      if (!ticketId || !currentWorkspace || !currentUser) throw new Error('Missing context');

      const { data, error } = await supabase
        .from('ticket_comments')
        .insert([{
          workspace_id: currentWorkspace.id,
          ticket_id: ticketId,
          author_id: currentUser.id,
          body
        }])
        .select('*')
        .single();
      
      if (error) throw error;

      if (mentionedUserIds && mentionedUserIds.length > 0) {
        const notificationsToInsert = mentionedUserIds.map(userId => ({
          workspace_id: currentWorkspace.id,
          recipient_id: userId,
          actor_id: currentUser.id,
          type: 'mention',
          title: 'Mentioned in a comment',
          message: `${currentUser.full_name || currentUser.email || 'Someone'} mentioned you in a comment.`,
          entity_type: 'ticket',
          entity_id: ticketId,
          is_read: false
        }));
        
        const { error: notifError } = await supabase.from('notifications').insert(notificationsToInsert);
        if (notifError) {
          console.error('Failed to create notifications for mentions', notifError);
        }
      }

      return {
        ...data,
        author: currentUser
      } as TicketComment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', ticketId] });
    }
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data, error } = await supabase
        .from('ticket_comments')
        .update({ body, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', ticketId] });
    }
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ticket_comments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', ticketId] });
    }
  });

  return {
    comments,
    isLoading,
    error,
    addComment: addCommentMutation.mutate,
    updateComment: updateCommentMutation.mutate,
    deleteComment: deleteCommentMutation.mutate
  };
}
