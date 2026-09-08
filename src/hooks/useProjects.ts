import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Project } from '../types/database';
import { useApp } from '../context/AppContext';

export function useProjects(options?: { workspaceId?: string; teamId?: string } | string) {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useApp();

  const workspaceId = (typeof options === 'string' ? undefined : options?.workspaceId) || currentWorkspace?.id;
  const teamId = typeof options === 'string' ? options : options?.teamId;

  // Fetch projects in a specific team or workspace
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects', { workspaceId, teamId }],
    queryFn: async () => {
      let query = supabase
        .from('projects')
        .select('*, issues(id, state_id)')
        .order('name');
      
      if (teamId) {
        query = query.eq('team_id', teamId);
      } else if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      } else {
        return [];
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!teamId || !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: async (newProject: Partial<Project> & { workspace_id: string; team_id: string; name: string; key: string }) => {
      const { data, error } = await supabase
        .from('projects')
        .insert([newProject])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Project> & { id: string }) => {
      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: projToDel } = await supabase.from('projects').select('team_id').eq('id', id).single();
      
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      return projToDel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });

  return {
    projects,
    isLoading,
    error,
    createProject: createMutation.mutate,
    updateProject: updateMutation.mutate,
    /**
     * Use this when you need to know whether the write succeeded. `updateProject` is
     * `mutate`, which returns void — awaiting it resolves immediately and a rejection
     * never reaches the caller's catch block.
     */
    updateProjectAsync: updateMutation.mutateAsync,
    deleteProject: deleteMutation.mutate,
  };
}
