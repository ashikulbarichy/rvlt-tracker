import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Sprint, SprintResult, StateCategory, Ticket } from '../types/database';
import { useApp } from '../context/AppContext';

// ---------------------------------------------------------------------------
// Pure helpers. Exported so the arithmetic can be checked without a database.
// ---------------------------------------------------------------------------

export const DEFAULT_SPRINT_DAYS = 14;

export const sprintLabel = (sprint: Pick<Sprint, 'name' | 'number'>): string =>
  sprint.name?.trim() || `Sprint ${sprint.number}`;

/** yyyy-mm-dd as a LOCAL date. `new Date('2026-10-01')` would be UTC midnight. */
export const parseDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Dates for a new sprint: the day after the team's last sprint ends, or today if that
 * is already in the past, running DEFAULT_SPRINT_DAYS inclusive. Never overlaps an
 * existing sprint of the team, which the database would refuse anyway.
 */
export function defaultSprintDates(teamSprints: Pick<Sprint, 'end_date'>[], today = new Date()) {
  const todayStart = startOfDay(today);
  const latestEnd = teamSprints.reduce<Date | null>((latest, sprint) => {
    const end = parseDate(sprint.end_date);
    return !latest || end > latest ? end : latest;
  }, null);

  const dayAfterLatest = latestEnd ? addDays(latestEnd, 1) : null;
  const start = dayAfterLatest && dayAfterLatest > todayStart ? dayAfterLatest : todayStart;

  return { start: toIsoDate(start), end: toIsoDate(addDays(start, DEFAULT_SPRINT_DAYS - 1)) };
}

/** Whole days from today until the end date. 0 on the last day, negative once overdue. */
export function daysRemaining(sprint: Pick<Sprint, 'end_date'>, today = new Date()): number {
  const ms = parseDate(sprint.end_date).getTime() - startOfDay(today).getTime();
  return Math.round(ms / 86_400_000);
}

export function describeDaysRemaining(days: number): string {
  if (days > 1) return `${days} days left`;
  if (days === 1) return '1 day left';
  if (days === 0) return 'Last day';
  return `${-days} day${days === -1 ? '' : 's'} overdue`;
}

type ProgressTicket = Pick<Ticket, 'id' | 'type_id' | 'project_id'> & {
  status?: { category?: StateCategory } | null;
  type?: { id: string; name: string; color: string } | null;
  project?: { id: string; name: string } | null;
};

const categoryOf = (ticket: ProgressTicket): StateCategory | undefined => ticket.status?.category;

export interface SprintProgress {
  total: number;
  done: number;
  canceled: number;
  open: number;
  /**
   * done ÷ (total − canceled). Canceled work is closed but not delivered, so it leaves
   * the denominator instead of pinning the bar below 100% forever.
   */
  percent: number;
  byType: { id: string; name: string; color: string; total: number; done: number }[];
}

/** Every ticket type counts — a sprint is a commitment of work, not a feature tally. */
export function computeSprintProgress(tickets: ProgressTicket[]): SprintProgress {
  let done = 0;
  let canceled = 0;
  const byType = new Map<string, SprintProgress['byType'][number]>();

  for (const ticket of tickets) {
    const category = categoryOf(ticket);
    const isDone = category === 'completed';
    if (isDone) done += 1;
    if (category === 'canceled') canceled += 1;

    const typeId = ticket.type?.id || ticket.type_id;
    const slot = byType.get(typeId) || {
      id: typeId,
      name: ticket.type?.name || 'Untyped',
      color: ticket.type?.color || '#6B7280',
      total: 0,
      done: 0,
    };
    slot.total += 1;
    if (isDone) slot.done += 1;
    byType.set(typeId, slot);
  }

  const total = tickets.length;
  const countable = total - canceled;

  return {
    total,
    done,
    canceled,
    open: total - done - canceled,
    percent: countable > 0 ? Math.round((done / countable) * 100) : 0,
    byType: Array.from(byType.values()).sort((a, b) => b.total - a.total),
  };
}

export interface ProjectSlice {
  projectId: string | null;
  name: string;
  total: number;
  done: number;
}

/**
 * Which projects a sprint advanced. Derived, never stored — the association the
 * interview settled on. "No project" always sorts last.
 */
export function groupByProject(tickets: ProgressTicket[]): ProjectSlice[] {
  const slices = new Map<string, ProjectSlice>();

  for (const ticket of tickets) {
    const key = ticket.project_id || '__none__';
    const slice = slices.get(key) || {
      projectId: ticket.project_id || null,
      name: ticket.project?.name || 'No project',
      total: 0,
      done: 0,
    };
    slice.total += 1;
    if (categoryOf(ticket) === 'completed') slice.done += 1;
    slices.set(key, slice);
  }

  return Array.from(slices.values()).sort((a, b) => {
    if (a.projectId === null) return 1;
    if (b.projectId === null) return -1;
    return b.total - a.total;
  });
}

export const CATEGORY_ORDER: StateCategory[] = ['started', 'unstarted', 'backlog', 'completed', 'canceled'];

export const CATEGORY_LABEL: Record<StateCategory, string> = {
  started: 'In progress',
  unstarted: 'To do',
  backlog: 'Backlog',
  completed: 'Done',
  canceled: 'Canceled',
};

// ---------------------------------------------------------------------------
// Queries
//
// Ticket queries are keyed under ['tickets', ...] and shaped { data, count }, the same
// as useTickets. That is deliberate: every existing ticket mutation invalidates the
// ['tickets'] prefix, and setTicketStatus's optimistic patch walks that prefix and
// touches only entries of this shape — so sprint views stay fresh for free.
// ---------------------------------------------------------------------------

const SPRINT_TICKET_SELECT = `
  *,
  status:state_id(id, name, color, position, category),
  type:type_id(id, name, color, position, counts_toward_progress),
  team:team_id(id, name, key),
  project:project_id(id, name, key),
  sprint:sprint_id(id, number, name, status),
  workspace:workspace_id(id, name, ticket_prefix)
`;

type CachedTickets = { data: Ticket[]; count: number };

const isClosed = (ticket: Ticket) => {
  const category = ticket.status?.category;
  return category === 'completed' || category === 'canceled';
};

/** Sprints in the current workspace, optionally for one team. RLS limits it to teams you are on. */
export function useSprints(teamId?: string) {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useApp();
  const workspaceId = currentWorkspace?.id;

  const { data: sprints, isLoading, error } = useQuery({
    queryKey: ['sprints', workspaceId, teamId ?? 'all'],
    queryFn: async () => {
      if (!workspaceId) return [];

      let query = supabase
        .from('sprints')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('start_date', { ascending: false });

      if (teamId) query = query.eq('team_id', teamId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Sprint[];
    },
    enabled: !!workspaceId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sprints'] });
    // Starting, completing or deleting a sprint moves tickets.
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['sprint_results'] });
  };

  const createMutation = useMutation({
    mutationFn: async (input: {
      team_id: string;
      name?: string | null;
      goal?: string | null;
      start_date: string;
      end_date: string;
    }) => {
      if (!workspaceId) throw new Error('No workspace selected.');

      // `number`, `status` and `created_by` are set by the sprints_before_write trigger.
      const { data, error } = await supabase
        .from('sprints')
        .insert({
          workspace_id: workspaceId,
          team_id: input.team_id,
          name: input.name?.trim() || null,
          goal: input.goal?.trim() || null,
          start_date: input.start_date,
          end_date: input.end_date,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Sprint;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Pick<Sprint, 'id'> & Partial<Pick<Sprint, 'name' | 'goal' | 'start_date' | 'end_date'>>) => {
      const { error } = await supabase
        .from('sprints')
        .update({
          ...updates,
          ...(updates.name !== undefined ? { name: updates.name?.trim() || null } : {}),
          ...(updates.goal !== undefined ? { goal: updates.goal?.trim() || null } : {}),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // RLS turns a refused delete into zero rows and no error. Asking for the deleted
      // row back is the only way to tell "deleted" from "not allowed".
      const { data, error } = await supabase.from('sprints').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Only a workspace admin can delete a sprint, and only before it starts.');
      }
    },
    onSuccess: invalidate,
  });

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('start_sprint', { p_sprint_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const completeMutation = useMutation({
    mutationFn: async ({ id, carryTo }: { id: string; carryTo: string | null }) => {
      const { data, error } = await supabase.rpc('complete_sprint', {
        p_sprint_id: id,
        p_carry_to: carryTo,
      });
      if (error) throw error;
      return data as Record<'completed' | 'canceled' | 'carried_over' | 'returned_to_backlog', number>;
    },
    onSuccess: invalidate,
  });

  return {
    sprints,
    isLoading,
    error,
    createSprint: createMutation.mutateAsync,
    updateSprint: updateMutation.mutateAsync,
    deleteSprint: deleteMutation.mutateAsync,
    startSprint: startMutation.mutateAsync,
    completeSprint: completeMutation.mutateAsync,
  };
}

/** Every live ticket committed to one sprint, whatever its state or age. */
export function useSprintTickets(sprintId?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'sprint', sprintId],
    queryFn: async (): Promise<CachedTickets> => {
      if (!sprintId) return { data: [], count: 0 };

      const { data, error } = await supabase
        .from('tickets')
        .select(SPRINT_TICKET_SELECT)
        .eq('sprint_id', sprintId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) throw error;
      const rows = (data || []) as Ticket[];
      return { data: rows, count: rows.length };
    },
    enabled: !!sprintId,
  });

  return { tickets: data?.data || [], isLoading, error };
}

/** A team's open tickets that are in no sprint — what planning draws from. */
export function useTeamBacklog(teamId?: string, enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'backlog', teamId],
    queryFn: async (): Promise<CachedTickets> => {
      if (!teamId) return { data: [], count: 0 };

      const { data, error } = await supabase
        .from('tickets')
        .select(SPRINT_TICKET_SELECT)
        .eq('team_id', teamId)
        .is('sprint_id', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      // Closed tickets are not plannable. Filtered here because the category lives on
      // the joined state, and PostgREST embedded filters would hide the join instead.
      const rows = ((data || []) as Ticket[]).filter(ticket => !isClosed(ticket));
      return { data: rows, count: rows.length };
    },
    enabled: !!teamId && enabled,
  });

  return { tickets: data?.data || [], isLoading, error };
}

/**
 * Ticket state per sprint across the workspace, for the progress bars on the list page.
 * One query rather than one per sprint.
 */
export function useSprintTicketCounts() {
  const { currentWorkspace } = useApp();
  const workspaceId = currentWorkspace?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets', 'sprint-counts', workspaceId],
    queryFn: async (): Promise<CachedTickets> => {
      if (!workspaceId) return { data: [], count: 0 };

      const { data, error } = await supabase
        .from('tickets')
        .select('id, sprint_id, state_id, type_id, project_id, status:state_id(category)')
        .eq('workspace_id', workspaceId)
        .not('sprint_id', 'is', null)
        .is('deleted_at', null);

      if (error) throw error;
      const rows = (data || []) as unknown as Ticket[];
      return { data: rows, count: rows.length };
    },
    enabled: !!workspaceId,
  });

  const bySprint = new Map<string, SprintProgress>();
  const grouped = new Map<string, Ticket[]>();
  for (const ticket of data?.data || []) {
    if (!ticket.sprint_id) continue;
    const list = grouped.get(ticket.sprint_id) || [];
    list.push(ticket);
    grouped.set(ticket.sprint_id, list);
  }
  grouped.forEach((tickets, sprintId) => bySprint.set(sprintId, computeSprintProgress(tickets)));

  return { bySprint, isLoading, error };
}

/** What complete_sprint() recorded. Only meaningful for a completed sprint. */
export function useSprintResults(sprintId?: string, enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sprint_results', sprintId],
    queryFn: async () => {
      if (!sprintId) return [];
      const { data, error } = await supabase
        .from('sprint_results')
        .select('*')
        .eq('sprint_id', sprintId);

      if (error) throw error;
      return (data || []) as SprintResult[];
    },
    enabled: !!sprintId && enabled,
  });

  return { results: data || [], isLoading, error };
}

/** Moves tickets into a sprint, or back to the backlog with `sprintId: null`. */
export function useMoveTicketsToSprint() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ ticketIds, sprintId }: { ticketIds: string[]; sprintId: string | null }) => {
      if (ticketIds.length === 0) return;

      // One statement, so the tickets_sprint_guard trigger refusing any ticket refuses
      // the whole move rather than leaving it half done.
      const { data, error } = await supabase
        .from('tickets')
        .update({ sprint_id: sprintId })
        .in('id', ticketIds)
        .select('id');

      if (error) throw error;
      const moved = (data || []).length;
      if (moved !== ticketIds.length) {
        throw new Error(`Only ${moved} of ${ticketIds.length} tickets could be moved.`);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
    },
  });

  return { moveTickets: mutation.mutateAsync, isMoving: mutation.isPending };
}
