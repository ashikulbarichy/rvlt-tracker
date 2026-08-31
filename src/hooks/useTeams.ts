import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Team } from '../types/database';

export function useTeams(workspaceId?: string) {
  const queryClient = useQueryClient();

  // Fetch teams in a specific workspace
  const { data: teams, isLoading, error } = useQuery({
    queryKey: ['teams', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name');
      
      if (error) throw error;
      return data as Team[];
    },
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: async (newTeam: Partial<Team> & { workspace_id: string; name: string; key: string }) => {
      const { data, error } = await supabase
        .from('teams')
        .insert([newTeam])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams', data.workspace_id] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Team> & { id: string }) => {
      const { data, error } = await supabase
        .from('teams')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams', data.workspace_id] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // First, get the team to know which workspace to invalidate
      const { data: teamToDel } = await supabase.from('teams').select('workspace_id').eq('id', id).single();
      
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      return teamToDel;
    },
    onSuccess: (deletedTeam) => {
      if (deletedTeam) {
        queryClient.invalidateQueries({ queryKey: ['teams', deletedTeam.workspace_id] });
      }
    }
  });

  return {
    teams,
    isLoading,
    error,
    createTeam: createMutation.mutate,
    updateTeam: updateMutation.mutate,
    deleteTeam: deleteMutation.mutate,
  };
}
