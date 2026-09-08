import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { WorkflowState } from '../types/database';
import { useApp } from '../context/AppContext';

/** One filter option, collapsing the same status name across teams. */
export interface WorkflowStateGroup {
  /** Normalized name — stable key for rendering. */
  key: string;
  name: string;
  color: string;
  category: WorkflowState['category'];
  position: number;
  /**
   * Every state id sharing this name. Workflow states are per-team and each team is
   * seeded the same defaults, so filtering on one id alone would hide the other teams'
   * issues in the same status.
   */
  ids: string[];
}

/**
 * Collapse workflow states to one entry per distinct name, keeping all matching ids.
 * Without this, a workspace with N teams shows each status N times.
 */
export function groupWorkflowStatesByName(states?: WorkflowState[] | null): WorkflowStateGroup[] {
  if (!states || states.length === 0) return [];

  const groups = new Map<string, WorkflowStateGroup>();

  for (const state of states) {
    const key = state.name.trim().toLowerCase();
    const existing = groups.get(key);

    if (existing) {
      existing.ids.push(state.id);
      // Keep the earliest column position so ordering matches the board.
      existing.position = Math.min(existing.position, state.position);
    } else {
      groups.set(key, {
        key,
        name: state.name.trim(),
        color: state.color,
        category: state.category,
        position: state.position,
        ids: [state.id],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.position - b.position);
}

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
