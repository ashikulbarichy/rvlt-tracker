import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { TeamMember, Profile, Team } from '../types/database';

export function useTeamMembers(workspaceId?: string, teamId?: string) {
  const queryClient = useQueryClient();

  const { data: teamMembers = [], isLoading, error } = useQuery({
    queryKey: ['team_members', workspaceId, teamId],
    queryFn: async () => {
      if (!workspaceId) return [];

      let query = supabase
        .from('team_members')
        .select(`
          *,
          team:teams(*)
        `)
        .eq('workspace_id', workspaceId);

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;
      if (error) {
        // Table might not exist yet if migration hasn't run
        console.warn('team_members fetch error:', error.message);
        return [];
      }

      if (!data || data.length === 0) return [];

      // Hydrate profiles
      const userIds = Array.from(new Set(data.map(tm => tm.user_id)));
      let profiles: Profile[] = [];
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);
        profiles = (profileData as Profile[]) || [];
      }

      const mapped: TeamMember[] = data.map(tm => ({
        ...tm,
        team: tm.team as Team,
        profile: profiles.find(p => p.id === tm.user_id) || undefined
      }));

      return mapped;
    },
    enabled: !!workspaceId,
  });

  const assignMember = useMutation({
    mutationFn: async ({
      teamId,
      userId,
    }: {
      teamId: string;
      userId: string;
    }) => {
      if (!workspaceId) throw new Error('No workspace selected');

      const { data, error } = await supabase
        .from('team_members')
        .insert([{
          workspace_id: workspaceId,
          team_id: teamId,
          user_id: userId,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['teams', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });

  const removeMember = useMutation({
    mutationFn: async ({
      teamId,
      userId,
    }: {
      teamId: string;
      userId: string;
    }) => {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', userId);

      if (error) throw error;
      return { teamId, userId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['teams', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });

  // Helper: get all teams for a user
  const getUserTeams = (userId: string): Team[] => {
    return teamMembers
      .filter(tm => tm.user_id === userId && tm.team)
      .map(tm => tm.team as Team);
  };

  // Helper: get all members for a team
  const getTeamUsers = (tId: string): TeamMember[] => {
    return teamMembers.filter(tm => tm.team_id === tId);
  };

  return {
    teamMembers,
    isLoading,
    error,
    assignMember: assignMember.mutateAsync,
    removeMember: removeMember.mutateAsync,
    isAssigning: assignMember.isPending,
    isRemoving: removeMember.isPending,
    getUserTeams,
    getTeamUsers,
  };
}
