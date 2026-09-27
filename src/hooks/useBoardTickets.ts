import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { Ticket } from '../types/database';

// The same embed useTickets uses, so a ticket opened from a board card is complete
// enough for TicketDetailModal.
const TICKET_SELECT = `
  *,
  status:state_id(id, name, color, position, category),
  type:type_id(id, name, color, position, counts_toward_progress, takes_story_points),
  team:team_id(id, name, key),
  project:project_id(id, name, key),
  sprint:sprint_id(id, number, name, status),
  workspace:workspace_id(id, name, ticket_prefix)
`;

// Stable empties, so a memo keyed on the result does not recompute every render.
const NO_TICKETS: Ticket[] = [];

/**
 * The live tickets behind the ticket cards on a board. Cards store only the ticket id,
 * so status and title here are always current; a ticket the viewer cannot see (or that
 * was deleted) is simply absent and its card shows as unavailable.
 */
export function useBoardTickets(ticketIds: string[]) {
  const sorted = [...new Set(ticketIds)].sort();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'board-cards', sorted],
    queryFn: async () => {
      if (sorted.length === 0) return [] as Ticket[];
      const { data, error } = await supabase
        .from('tickets')
        .select(TICKET_SELECT)
        .in('id', sorted)
        .is('deleted_at', null);
      if (error) throw error;
      return (data || []) as Ticket[];
    },
    enabled: sorted.length > 0,
    staleTime: 30_000,
  });

  return { tickets: data ?? NO_TICKETS, isLoading, error };
}

/** Workspace tickets matching a query, for the "Add ticket card" picker. */
export function useTicketSearch(query: string) {
  const { currentWorkspace } = useApp();
  const q = query.trim();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'board-search', currentWorkspace?.id, q],
    queryFn: async () => {
      let request = supabase
        .from('tickets')
        .select(TICKET_SELECT)
        .eq('workspace_id', currentWorkspace!.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(12);
      if (q) {
        // Commas and parentheses would break PostgREST's or() syntax.
        const safe = q.replace(/[,()]/g, ' ');
        request = request.or(`title.ilike.%${safe}%,identifier.ilike.%${safe}%`);
      }
      const { data, error } = await request;
      if (error) throw error;
      return (data || []) as Ticket[];
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 15_000,
  });

  return { results: data ?? NO_TICKETS, isLoading, error };
}
