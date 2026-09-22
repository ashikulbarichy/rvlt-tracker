import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Team } from '../types/database';

/**
 * Every team in the workspace, for choosing who to share a document with.
 *
 * Deliberately NOT useTeams. The teams SELECT policy shows a non-admin only the teams
 * they belong to, which is correct everywhere else in the app and wrong here — an author
 * should be able to hand a document to a team they are not on. The
 * `shareable_teams` function (migration 20260929090000) is a SECURITY DEFINER read that
 * returns names to any workspace member without widening that policy.
 *
 * Never use this to decide what someone may DO. It answers "which teams exist", not
 * "which teams am I on"; substituting it for useTeams in a permission check would grant
 * edit rights on every team-shared document.
 */
export function useShareableTeams(workspaceId?: string) {
  const { data: shareableTeams, isLoading, error } = useQuery({
    queryKey: ['shareable_teams', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data, error } = await supabase.rpc('shareable_teams', {
        p_workspace_id: workspaceId,
      });

      if (error) throw error;
      return (data || []) as Team[];
    },
    enabled: !!workspaceId,
  });

  return { shareableTeams, isLoading, error };
}
