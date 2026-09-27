import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { StateCategory, Ticket } from '../types/database';

/** Enough of the other ticket to list it. */
export type LinkedTicket = Pick<Ticket, 'id' | 'title' | 'ticket_number' | 'team_id'> & {
  team?: { id: string; key: string; name: string } | null;
  status?: { id: string; name: string; color: string; category: StateCategory } | null;
};

const LINKED = 'id, title, ticket_number, team_id, team:team_id(id, key, name), status:state_id(id, name, color, category)';

const isOpen = (t?: LinkedTicket | null) =>
  !!t && t.status?.category !== 'completed' && t.status?.category !== 'canceled';

/** What blocks a ticket, and what it blocks. */
export function useTicketBlocks(ticketId?: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['ticket_blocks', ticketId],
    queryFn: async () => {
      if (!ticketId) return { blockedBy: [], blocking: [] };
      const [by, blocking] = await Promise.all([
        supabase.from('ticket_blocks').select(`blocker:blocker_id(${LINKED})`).eq('blocked_id', ticketId),
        supabase.from('ticket_blocks').select(`blocked:blocked_id(${LINKED})`).eq('blocker_id', ticketId),
      ]);
      if (by.error) throw by.error;
      if (blocking.error) throw blocking.error;
      return {
        blockedBy: ((by.data || []) as unknown as { blocker: LinkedTicket | null }[])
          .map(r => r.blocker)
          .filter((t): t is LinkedTicket => !!t),
        blocking: ((blocking.data || []) as unknown as { blocked: LinkedTicket | null }[])
          .map(r => r.blocked)
          .filter((t): t is LinkedTicket => !!t),
      };
    },
    enabled: !!ticketId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ticket_blocks'] });

  const add = useMutation({
    mutationFn: async (link: { blockerId: string; blockedId: string; workspaceId: string }) => {
      const { error } = await supabase.from('ticket_blocks').insert({
        blocker_id: link.blockerId,
        blocked_id: link.blockedId,
        workspace_id: link.workspaceId,
      });
      if (error) {
        if (error.code === '23505') throw new Error('That link already exists.');
        throw error;
      }
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (link: { blockerId: string; blockedId: string }) => {
      const { data, error } = await supabase
        .from('ticket_blocks')
        .delete()
        .eq('blocker_id', link.blockerId)
        .eq('blocked_id', link.blockedId)
        .select('blocker_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('You cannot remove this link.');
    },
    onSettled: invalidate,
  });

  return {
    blockedBy: data?.blockedBy ?? EMPTY,
    blocking: data?.blocking ?? EMPTY,
    /** Only unfinished blockers hold a ticket up. */
    isBlocked: (data?.blockedBy ?? EMPTY).some(isOpen),
    isLoading,
    error,
    addBlock: add.mutateAsync,
    removeBlock: remove.mutateAsync,
  };
}

const EMPTY: LinkedTicket[] = [];

/**
 * Which of these tickets are held up by an unfinished blocker, with the blockers' titles.
 * One query for a whole board.
 */
export function useBlockedTickets(ticketIds: string[]) {
  const ids = [...ticketIds].sort();
  const { data, error } = useQuery({
    queryKey: ['ticket_blocks', 'blocked', ids.join(',')],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('ticket_blocks')
        .select(`blocked_id, blocker:blocker_id(${LINKED})`)
        .in('blocked_id', ids);
      if (error) throw error;
      return (data || []) as unknown as { blocked_id: string; blocker: LinkedTicket | null }[];
    },
    enabled: ids.length > 0,
  });

  const blocked = new Map<string, LinkedTicket[]>();
  for (const row of data ?? []) {
    if (!isOpen(row.blocker)) continue;
    const list = blocked.get(row.blocked_id) || [];
    list.push(row.blocker as LinkedTicket);
    blocked.set(row.blocked_id, list);
  }
  return { blocked, error };
}

/** Tickets in the workspace matching a title or number, for the "blocked by" picker. */
export function useTicketSearch(workspaceId: string | undefined, query: string, excludeId?: string) {
  const q = query.trim();
  const { data, isFetching, error } = useQuery({
    queryKey: ['tickets', 'search', workspaceId, q],
    queryFn: async () => {
      if (!workspaceId || !q) return [];
      const number = Number(q.replace(/^.*-/, ''));
      let request = supabase
        .from('tickets')
        .select(LINKED)
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .limit(8);
      request = Number.isFinite(number) && number > 0
        ? request.or(`ticket_number.eq.${number},title.ilike.%${q.replace(/[%,()]/g, ' ')}%`)
        : request.ilike('title', `%${q.replace(/[%,()]/g, ' ')}%`);
      const { data, error } = await request;
      if (error) throw error;
      return (data || []) as unknown as LinkedTicket[];
    },
    enabled: !!workspaceId && q.length > 0,
    staleTime: 30_000,
  });

  return { results: (data ?? EMPTY).filter(t => t.id !== excludeId), isFetching, error };
}
