import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { DocShare } from '../types/database';
import { useApp } from '../context/AppContext';

interface GrantInput {
  docId: string;
  /** Exactly one of these, matching the doc_shares_one_principal constraint. */
  userId?: string;
  teamId?: string;
  canEdit: boolean;
}

/**
 * Who a restricted document is shared with.
 *
 * RLS decides what comes back: the author and workspace admins see every share, while
 * anyone else sees only the rows that name them or one of their teams. So an empty list
 * means "none that concern you", not "shared with nobody" — the share panel is shown
 * only to people who can manage access, where the two coincide.
 */
export function useDocShares(docId?: string) {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useApp();

  const { data: shares, isLoading, error } = useQuery({
    queryKey: ['doc_shares', docId],
    queryFn: async () => {
      if (!docId) return [];

      // No embeds. user_id references auth.users, which PostgREST cannot join to, and
      // there is no foreign key to public.profiles -- the same reason
      // useWorkspaceMembers resolves profiles separately. The share panel already holds
      // the workspace's members and teams, so names are resolved there rather than
      // spending a second round trip here.
      const { data, error } = await supabase
        .from('doc_shares')
        .select('*')
        .eq('doc_id', docId);

      if (error) throw error;
      return (data || []) as DocShare[];
    },
    enabled: !!docId && !!currentWorkspace,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['doc_shares', docId] });
    // A share can add or remove someone's access to the document itself.
    queryClient.invalidateQueries({ queryKey: ['doc', docId] });
    queryClient.invalidateQueries({ queryKey: ['docs'] });
  };

  /** Adds a share, or changes the level of one that already exists. */
  const grantMutation = useMutation({
    mutationFn: async ({ docId: id, userId, teamId, canEdit }: GrantInput) => {
      if (!currentWorkspace) throw new Error('No workspace selected.');
      if (!userId === !teamId) {
        throw new Error('A share names either a person or a team, not both.');
      }

      const { error } = await supabase
        .from('doc_shares')
        .upsert(
          {
            workspace_id: currentWorkspace.id,
            doc_id: id,
            user_id: userId ?? null,
            team_id: teamId ?? null,
            can_edit: canEdit,
          },
          // Partial unique indexes, one per principal kind, so the conflict target has
          // to name the right pair rather than the whole row.
          { onConflict: userId ? 'doc_id,user_id' : 'doc_id,team_id' }
        );

      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const revokeMutation = useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await supabase.from('doc_shares').delete().eq('id', shareId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    shares,
    isLoading,
    error,
    grantShare: grantMutation.mutateAsync,
    revokeShare: revokeMutation.mutateAsync,
    isWriting: grantMutation.isPending || revokeMutation.isPending,
  };
}
