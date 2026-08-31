import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Workspace } from '../types/database';

export function useWorkspaces() {
  const queryClient = useQueryClient();

  // Fetch workspaces the user is a member of
  const { data: workspaces, isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Workspace[];
    }
  });

  // Create workspace mutation
  const createMutation = useMutation({
    mutationFn: async (newWorkspace: Pick<Workspace, 'name' | 'slug'> & { created_by?: string }) => {
      let createdBy = newWorkspace.created_by;
      if (!createdBy) {
        const { data: authData } = await supabase.auth.getUser();
        createdBy = authData.user?.id;
      }
      if (!createdBy) throw new Error('Authenticated user required');

      const payload = {
        name: newWorkspace.name,
        slug: newWorkspace.slug,
        created_by: createdBy
      };

      // 1. Insert into workspaces without select() to avoid RLS evaluation on RETURNING before trigger commits
      const { error: insertError } = await supabase
        .from('workspaces')
        .insert([payload]);
      
      if (insertError) throw insertError;

      // 2. Fetch the created workspace
      const { data: createdWs } = await supabase
        .from('workspaces')
        .select('*')
        .eq('slug', payload.slug)
        .maybeSingle();

      return createdWs;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    }
  });

  // Update workspace mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Workspace> & { id: string }) => {
      const { data, error } = await supabase
        .from('workspaces')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    }
  });

  // Delete workspace mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    }
  });

  return {
    workspaces,
    isLoading,
    error,
    createWorkspace: createMutation.mutate,
    createWorkspaceAsync: createMutation.mutateAsync,
    updateWorkspace: updateMutation.mutate,
    deleteWorkspace: deleteMutation.mutate,
  };
}
