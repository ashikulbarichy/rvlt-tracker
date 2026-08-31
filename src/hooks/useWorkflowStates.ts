import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { WorkflowState } from '../types/database';
import { useApp } from '../context/AppContext';

export function useWorkflowStates(teamId?: string) {
  const { currentWorkspace } = useApp();
  
  const { data: workflowStates, isLoading, error, refetch } = useQuery({
    queryKey: ['workflow_states', currentWorkspace?.id, teamId],
    queryFn: async () => {
      if (!currentWorkspace) return [];

      let query = supabase
        .from('workflow_states')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('position');

      if (teamId) {
        query = query.eq('team_id', teamId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as WorkflowState[];
    },
    enabled: !!currentWorkspace
  });

  const updateWorkflowState = async (stateId: string, updates: Partial<WorkflowState>) => {
    const { error } = await supabase
      .from('workflow_states')
      .update(updates)
      .eq('id', stateId)
      .eq('workspace_id', currentWorkspace?.id);
      
    if (error) throw error;
    await refetch();
  };

  return {
    workflowStates,
    isLoading,
    error,
    updateWorkflowState,
    refetch
  };
}
