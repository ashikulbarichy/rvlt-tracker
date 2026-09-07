import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { RoadmapItem } from '../types/database';
import { useApp } from '../context/AppContext';

export function useRoadmapItems(options?: { workspaceId?: string; projectId?: string }) {
  const queryClient = useQueryClient();
  const { currentWorkspace, currentUser } = useApp();

  const workspaceId = options?.workspaceId || currentWorkspace?.id;
  const projectId = options?.projectId;

  const { data: roadmapItems, isLoading, error } = useQuery({
    queryKey: ['roadmapItems', { workspaceId, projectId }],
    queryFn: async () => {
      if (!workspaceId) return [];

      let query = supabase
        .from('roadmap_items')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching roadmap items:', error);
        throw error;
      }
      return (data || []) as RoadmapItem[];
    },
    enabled: !!workspaceId
  });

  const createRoadmapItemMutation = useMutation({
    mutationFn: async (newItem: Partial<RoadmapItem> & { project_id: string; title: string }) => {
      if (!workspaceId) throw new Error('Missing active workspace');

      // Append to the end of the target project's lane, using the list we
      // already have cached rather than a round trip for max(position).
      const siblings = (roadmapItems || []).filter(i => i.project_id === newItem.project_id);
      const nextPosition = siblings.reduce((max, i) => Math.max(max, i.position), -1) + 1;

      const payload: any = {
        workspace_id: workspaceId,
        project_id: newItem.project_id,
        title: newItem.title,
        start_date: newItem.start_date || null,
        target_date: newItem.target_date || null,
        is_completed: false,
        position: nextPosition,
        created_by: currentUser?.id || null,
      };

      const { data, error } = await supabase
        .from('roadmap_items')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('Supabase error creating roadmap item:', error);
        throw error;
      }
      return data as RoadmapItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmapItems'] });
    }
  });

  const updateRoadmapItemMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RoadmapItem> & { id: string }) => {
      if (!workspaceId) throw new Error('Missing active workspace');

      const { data, error } = await supabase
        .from('roadmap_items')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .select()
        .single();

      if (error) {
        console.error('Supabase error updating roadmap item:', error);
        throw error;
      }
      return data as RoadmapItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmapItems'] });
    }
  });

  const toggleRoadmapItemDoneMutation = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      if (!workspaceId) throw new Error('Missing active workspace');

      const { data, error } = await supabase
        .from('roadmap_items')
        .update({
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .select()
        .single();

      if (error) {
        console.error('Supabase error toggling roadmap item:', error);
        throw error;
      }
      return data as RoadmapItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmapItems'] });
    }
  });

  const reorderRoadmapItemsMutation = useMutation({
    mutationFn: async (ordered: { id: string; position: number }[]) => {
      if (!workspaceId) throw new Error('Missing active workspace');

      // An upsert would violate the title NOT NULL constraint, since these
      // rows only carry id + position.
      const results = await Promise.all(
        ordered.map(({ id, position }) =>
          supabase
            .from('roadmap_items')
            .update({ position, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('workspace_id', workspaceId)
        )
      );

      const failed = results.find(r => r.error);
      if (failed?.error) {
        console.error('Supabase error reordering roadmap items:', failed.error);
        throw failed.error;
      }
      return ordered;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmapItems'] });
    }
  });

  const deleteRoadmapItemMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!workspaceId) throw new Error('Missing active workspace');

      const { error } = await supabase
        .from('roadmap_items')
        .delete()
        .eq('id', id)
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('Supabase error deleting roadmap item:', error);
        throw error;
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmapItems'] });
    }
  });

  return {
    roadmapItems,
    isLoading,
    error,
    createRoadmapItem: createRoadmapItemMutation.mutate,
    createRoadmapItemAsync: createRoadmapItemMutation.mutateAsync,
    updateRoadmapItem: updateRoadmapItemMutation.mutate,
    updateRoadmapItemAsync: updateRoadmapItemMutation.mutateAsync,
    toggleRoadmapItemDone: toggleRoadmapItemDoneMutation.mutate,
    toggleRoadmapItemDoneAsync: toggleRoadmapItemDoneMutation.mutateAsync,
    reorderRoadmapItems: reorderRoadmapItemsMutation.mutate,
    reorderRoadmapItemsAsync: reorderRoadmapItemsMutation.mutateAsync,
    deleteRoadmapItem: deleteRoadmapItemMutation.mutate,
    deleteRoadmapItemAsync: deleteRoadmapItemMutation.mutateAsync
  };
}
