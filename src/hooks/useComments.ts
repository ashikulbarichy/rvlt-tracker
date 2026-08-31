import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { IssueComment } from '../types/database';
import { useApp } from '../context/AppContext';

export function useComments(issueId?: string) {
  const queryClient = useQueryClient();
  const { currentWorkspace, currentUser } = useApp();

  const { data: comments, isLoading, error } = useQuery({
    queryKey: ['comments', issueId],
    queryFn: async () => {
      if (!issueId) return [];

      const { data, error } = await supabase
        .from('issue_comments')
        .select('*')
        .eq('issue_id', issueId)
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
      })) as IssueComment[];
    },
    enabled: !!issueId
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ body, mentionedUserIds }: { body: string; mentionedUserIds?: string[] }) => {
      if (!issueId || !currentWorkspace || !currentUser) throw new Error('Missing context');

      const { data, error } = await supabase
        .from('issue_comments')
        .insert([{
          workspace_id: currentWorkspace.id,
          issue_id: issueId,
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
          entity_type: 'issue',
          entity_id: issueId,
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
      } as IssueComment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', issueId] });
    }
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data, error } = await supabase
        .from('issue_comments')
        .update({ body, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', issueId] });
    }
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('issue_comments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', issueId] });
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
