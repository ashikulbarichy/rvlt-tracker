import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface SetProgressTypesInput {
  projectId: string;
  workspaceId: string;
  /** The full desired set. An empty array clears the override and inherits again. */
  typeIds: string[];
}

/**
 * Writes a project's progress-type override.
 *
 * There is no matching query hook: the selection arrives embedded on the project from
 * `useProjects`, so a second round trip for the same three rows would only introduce a
 * window where the picker and the progress bar disagree.
 *
 * The write is a diff rather than a delete-all-then-insert. Wiping first would leave the
 * project briefly inheriting the workspace default, which any concurrent reader would
 * see as the progress bar jumping.
 */
export function useProjectProgressTypes() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ projectId, workspaceId, typeIds }: SetProgressTypesInput) => {
      const { data: existing, error: readError } = await supabase
        .from('project_progress_types')
        .select('type_id')
        .eq('project_id', projectId);

      if (readError) throw readError;

      const currentIds = (existing || []).map(row => row.type_id as string);
      const toRemove = currentIds.filter(id => !typeIds.includes(id));
      const toAdd = typeIds.filter(id => !currentIds.includes(id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('project_progress_types')
          .delete()
          .eq('project_id', projectId)
          .in('type_id', toRemove);

        if (error) throw error;
      }

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('project_progress_types')
          .insert(
            toAdd.map(type_id => ({ workspace_id: workspaceId, project_id: projectId, type_id }))
          );

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return {
    setProgressTypes: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
