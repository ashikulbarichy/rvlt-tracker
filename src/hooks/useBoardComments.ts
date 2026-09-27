import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { BoardComment } from '../types/database';

export interface BoardThread {
  root: BoardComment;
  replies: BoardComment[];
}

/** Roots with their replies in order. Orphaned replies (root deleted) are dropped. */
export function groupThreads(comments: BoardComment[]): BoardThread[] {
  const roots = comments.filter(c => !c.parent_id);
  const byParent = new Map<string, BoardComment[]>();
  for (const c of comments) {
    if (!c.parent_id) continue;
    const list = byParent.get(c.parent_id) || [];
    list.push(c);
    byParent.set(c.parent_id, list);
  }
  return roots.map(root => ({ root, replies: byParent.get(root.id) || [] }));
}

const NO_COMMENTS: BoardComment[] = [];

/**
 * Pinned comment threads on a whiteboard. Anyone who can see the board may comment;
 * RLS decides, this only asks. `onChanged` tells the other people on the board to
 * refetch, since comments are not part of the live shape stream.
 */
export function useBoardComments(docId: string | undefined, onChanged?: () => void) {
  const queryClient = useQueryClient();
  const queryKey = ['board', docId, 'comments'];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doc_board_comments')
        .select('*')
        .eq('doc_id', docId!)
        .order('created_at');
      if (error) throw error;
      return (data || []) as BoardComment[];
    },
    enabled: !!docId,
  });

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey });
    onChanged?.();
  };

  const addComment = useMutation({
    mutationFn: async (input: { body: string; parentId?: string; x?: number; y?: number }) => {
      const { data, error } = await supabase
        .from('doc_board_comments')
        .insert({
          doc_id: docId,
          parent_id: input.parentId ?? null,
          x: input.parentId ? null : input.x,
          y: input.parentId ? null : input.y,
          body: input.body.trim(),
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as BoardComment;
    },
    onSuccess: settle,
  });

  const setResolved = useMutation({
    mutationFn: async ({ id, resolved, userId }: { id: string; resolved: boolean; userId?: string }) => {
      const { data, error } = await supabase
        .from('doc_board_comments')
        .update({
          resolved_at: resolved ? new Date().toISOString() : null,
          resolved_by: resolved ? userId ?? null : null,
        })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      // An UPDATE refused by RLS changes nothing and raises nothing.
      if (!data || data.length === 0) throw new Error('Only the author or an editor can resolve this thread.');
    },
    onSuccess: settle,
  });

  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('doc_board_comments').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('You can only delete your own comments.');
    },
    onSuccess: settle,
  });

  const comments = data ?? NO_COMMENTS;
  const threads = useMemo(() => groupThreads(comments), [comments]);

  return {
    comments: data,
    threads,
    isLoading,
    error,
    addComment: addComment.mutateAsync,
    setResolved: setResolved.mutateAsync,
    deleteComment: deleteComment.mutateAsync,
    refetch: () => queryClient.invalidateQueries({ queryKey }),
  };
}
