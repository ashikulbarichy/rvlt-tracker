import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { TicketType } from '../types/database';
import { useApp } from '../context/AppContext';

/**
 * Ticket types for the current workspace.
 *
 * Workspace-level, like workflow states after migration 003: a type is not owned by a
 * team, so there is no team parameter and one row exists per type name per workspace.
 *
 * `counts_toward_progress` is what drives the project progress bar — see
 * `countableTypeIds` below and its use in ProjectsView.
 */
export function useTicketTypes() {
  const { currentWorkspace } = useApp();

  const { data: ticketTypes, isLoading, error, refetch } = useQuery({
    queryKey: ['ticket_types', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];

      const { data, error } = await supabase
        .from('ticket_types')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('position');

      if (error) throw error;
      return data as TicketType[];
    },
    enabled: !!currentWorkspace,
  });

  /** Ids of the types that move a project's progress bar. */
  const countableTypeIds = new Set(
    (ticketTypes || []).filter(t => t.counts_toward_progress).map(t => t.id)
  );

  /** The type a new ticket gets, falling back to the first by position. */
  const defaultTicketType =
    (ticketTypes || []).find(t => t.is_default) || (ticketTypes || [])[0];

  const createTicketType = async (
    input: Pick<TicketType, 'name' | 'color'> & Partial<Pick<TicketType, 'counts_toward_progress'>>
  ) => {
    if (!currentWorkspace) throw new Error('No workspace selected.');

    const position = (ticketTypes || []).reduce((max, t) => Math.max(max, t.position), -1) + 1;

    const { error } = await supabase.from('ticket_types').insert({
      workspace_id: currentWorkspace.id,
      name: input.name.trim(),
      color: input.color,
      counts_toward_progress: input.counts_toward_progress ?? false,
      position,
    });

    if (error) throw error;
    await refetch();
  };

  const updateTicketType = async (typeId: string, updates: Partial<TicketType>) => {
    const { error } = await supabase
      .from('ticket_types')
      .update(updates)
      .eq('id', typeId)
      .eq('workspace_id', currentWorkspace?.id);

    if (error) throw error;
    await refetch();
  };

  /**
   * Exactly one default per workspace, enforced by a partial unique index. Clear the old
   * one first or the index rejects the write.
   */
  const setDefaultTicketType = async (typeId: string) => {
    if (!currentWorkspace) throw new Error('No workspace selected.');

    const previous = (ticketTypes || []).find(t => t.is_default && t.id !== typeId);
    if (previous) {
      const { error } = await supabase
        .from('ticket_types')
        .update({ is_default: false })
        .eq('id', previous.id);
      if (error) throw error;
    }

    const { error } = await supabase
      .from('ticket_types')
      .update({ is_default: true })
      .eq('id', typeId)
      .eq('workspace_id', currentWorkspace.id);

    if (error) throw error;
    await refetch();
  };

  /**
   * Deleting a type still in use fails on the `on delete restrict` foreign key. That is
   * intentional — the caller must show the error rather than appear to succeed.
   */
  const deleteTicketType = async (typeId: string) => {
    const { error } = await supabase
      .from('ticket_types')
      .delete()
      .eq('id', typeId)
      .eq('workspace_id', currentWorkspace?.id);

    if (error) {
      // 23503 = foreign_key_violation: tickets still point at this type.
      if ((error as { code?: string }).code === '23503') {
        throw new Error('That type is still in use. Reassign its tickets before deleting it.');
      }
      throw error;
    }
    await refetch();
  };

  return {
    ticketTypes,
    countableTypeIds,
    defaultTicketType,
    isLoading,
    error,
    createTicketType,
    updateTicketType,
    setDefaultTicketType,
    deleteTicketType,
    refetch,
  };
}
