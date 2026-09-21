import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Ticket, Profile, WorkflowState } from '../types/database';

/**
 * Which slice of the ticket lifecycle a query returns.
 *
 * `archived` is derived, never stored: a ticket is archived once it has been closed for
 * longer than the workspace's `archive_after_days` and nobody has unarchived it. Every
 * bucket except `trash` excludes soft-deleted tickets.
 */
export type TicketBucket =
  | 'open'
  | 'closed'
  /** Open plus recently closed — everything that is not archived. Used for stats. */
  | 'active'
  | 'archived'
  | 'trash'
  | 'all';

export const DEFAULT_ARCHIVE_AFTER_DAYS = 7;

/** Beyond the 365-day maximum window, so a manual archive stays archived at any setting. */
const MANUAL_ARCHIVE_BACKDATE_DAYS = 400;

/**
 * Cutoff for "closed long enough to be archived", quantized to the start of the current
 * hour. The quantizing is load-bearing: an unquantized `new Date()` changes on every
 * render, which changes the query key below, which refetches forever.
 */
export function archiveCutoffIso(archiveAfterDays = DEFAULT_ARCHIVE_AFTER_DAYS): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setDate(d.getDate() - archiveAfterDays);
  return d.toISOString();
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

interface UseTicketsOptions {
  workspaceId?: string;
  projectId?: string;
  teamId?: string;
  assigneeId?: string;
  statusId?: string;
  /** Multi-select status filter. Takes precedence over the single `statusId`. */
  statusIds?: string[];
  /**
   * Defaults to `all` so the nine existing callers keep their current behaviour. The
   * ticket and project lists pass `open` explicitly.
   */
  bucket?: TicketBucket;
  archiveAfterDays?: number;
  page?: number;
  limit?: number;
  searchQuery?: string;
}

export function useTickets(options: UseTicketsOptions) {
  const queryClient = useQueryClient();
  const {
    workspaceId, projectId, teamId, assigneeId, statusId, statusIds,
    bucket = 'all', archiveAfterDays = DEFAULT_ARCHIVE_AFTER_DAYS,
    page = 1, limit = 24, searchQuery,
  } = options;

  const cutoff = archiveCutoffIso(archiveAfterDays);
  // Sorted so ['a','b'] and ['b','a'] share a cache entry.
  const statusKey = statusIds && statusIds.length > 0 ? [...statusIds].sort().join(',') : undefined;

  const queryKey = ['tickets', { workspaceId, projectId, teamId, assigneeId, statusId, statusKey, bucket, cutoff, page, limit, searchQuery }];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspaceId) return { data: [], count: 0 };

      let query = supabase
        .from('tickets')
        .select(`
          *,
          status:state_id(id, name, color, position, category),
          type:type_id(id, name, color, position, counts_toward_progress),
          team:team_id(id, name, key),
          project:project_id(id, name, key),
          workspace:workspace_id(id, name, ticket_prefix)
        `, { count: 'exact' })
        .eq('workspace_id', workspaceId);

      if (projectId) query = query.eq('project_id', projectId);
      if (teamId) query = query.eq('team_id', teamId);
      if (searchQuery) query = query.ilike('title', `%${searchQuery}%`);

      // Bucket filters run server-side so `count: 'exact'` and range() stay correct.
      // Filtering the returned array instead would give wrong page counts.
      if (bucket !== 'trash') query = query.is('deleted_at', null);

      switch (bucket) {
        case 'open':
          query = query.is('closed_at', null);
          break;
        case 'closed':
          // Closed but not yet archived, or explicitly exempted from archiving.
          query = query
            .not('closed_at', 'is', null)
            .or(`closed_at.gte.${cutoff},unarchived_at.not.is.null`);
          break;
        case 'active':
          // The complement of 'archived': never closed, closed recently, or exempted.
          query = query.or(
            `closed_at.is.null,closed_at.gte.${cutoff},unarchived_at.not.is.null`
          );
          break;
        case 'archived':
          query = query.lt('closed_at', cutoff).is('unarchived_at', null);
          break;
        case 'trash':
          query = query.not('deleted_at', 'is', null);
          break;
        case 'all':
          break;
      }

      if (statusIds && statusIds.length > 0) {
        query = query.in('state_id', statusIds);
      } else if (statusId) {
        query = query.eq('state_id', statusId);
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const orderColumn = bucket === 'trash' ? 'deleted_at' : 'created_at';
      query = query.order(orderColumn, { ascending: false }).range(from, to);

      const { data, error, count } = await query;
      
      if (error) throw error;
      if (!data || data.length === 0) return { data: [], count: 0 };

      const ticketIds = data.map(i => i.id);
      const ticketAssigneeMap: Record<string, string[]> = {};
      const allAssigneeUserIds = new Set<string>();

      // Seed single assignee_id and reporter_id
      data.forEach(i => {
        if (i.assignee_id) allAssigneeUserIds.add(i.assignee_id);
        if (i.reporter_id) allAssigneeUserIds.add(i.reporter_id);
      });

      // Hydrate multi-assignees from public.ticket_assignees
      try {
        const { data: assigneesData } = await supabase
          .from('ticket_assignees')
          .select('ticket_id, user_id')
          .in('ticket_id', ticketIds);

        if (assigneesData) {
          assigneesData.forEach(row => {
            if (!ticketAssigneeMap[row.ticket_id]) ticketAssigneeMap[row.ticket_id] = [];
            ticketAssigneeMap[row.ticket_id].push(row.user_id);
            allAssigneeUserIds.add(row.user_id);
          });
        }
      } catch (assigneeErr) {
        console.warn('ticket_assignees fetch warning:', assigneeErr);
      }

      // Hydrate all unique user profiles
      let profiles: Profile[] = [];
      const userIdsList = Array.from(allAssigneeUserIds);
      if (userIdsList.length > 0) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIdsList);
        profiles = pData || [];
      }

      let mappedTickets = data.map(ticket => {
        const assignedUserIds = ticketAssigneeMap[ticket.id] || (ticket.assignee_id ? [ticket.assignee_id] : []);
        const assignedProfiles = assignedUserIds
          .map(uid => profiles.find(p => p.id === uid))
          .filter(Boolean) as Profile[];

        // Dynamically build ticketing name: [WS_PREFIX]-[TEAM_KEY]-[NUMBER]
        const wsPrefix = (ticket.workspace?.ticket_prefix || 'XXX').toUpperCase().trim();
        const teamKey = (ticket.team?.key || ticket.project?.key || '').toUpperCase().trim();
        const num = ticket.ticket_number || 1;
        const formattedNum = String(num).padStart(2, '0');
        const dynamicIdentifier = teamKey
          ? `${wsPrefix}-${teamKey}-${formattedNum}`
          : `${wsPrefix}-${formattedNum}`;

        return {
          ...ticket,
          identifier: dynamicIdentifier,
          assignee: profiles.find(p => p.id === ticket.assignee_id) || assignedProfiles[0] || null,
          assignees: assignedProfiles,
          assignee_ids: assignedUserIds,
          reporter: profiles.find(p => p.id === ticket.reporter_id) || null,
          status: ticket.status || null,
          state: ticket.status || null
        };
      });

      // Filter by assigneeId if specified (e.g. "Mine" filter)
      if (assigneeId) {
        mappedTickets = mappedTickets.filter(i => 
          i.assignee_id === assigneeId || i.assignee_ids.includes(assigneeId)
        );
      }

      return {
        data: mappedTickets,
        count: count || 0
      };
    },
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: async (newTicket: Partial<Ticket> & { workspace_id: string; title: string; assignee_ids?: string[] }) => {
      // 1. Ensure valid team_id
      let finalTeamId = newTicket.team_id;
      if (!finalTeamId) {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('id')
          .eq('workspace_id', newTicket.workspace_id)
          .limit(1);

        if (teamsData && teamsData.length > 0) {
          finalTeamId = teamsData[0].id;
        } else {
          // Create default team
          const { data: newTeam, error: teamErr } = await supabase
            .from('teams')
            .insert([{
              workspace_id: newTicket.workspace_id,
              name: 'Engineering',
              key: 'ENG'
            }])
            .select('id')
            .single();

          if (!teamErr && newTeam) {
            finalTeamId = newTeam.id;
          }
        }
      }

      // 2. Ensure valid state_id (required NOT NULL by schema)
      let finalStateId = newTicket.state_id;
      if (!finalStateId) {
        // Statuses are workspace-level as of migration 003 — no team filter.
        const { data: stateData } = await supabase
          .from('workflow_states')
          .select('id')
          .eq('workspace_id', newTicket.workspace_id)
          .order('position')
          .limit(1);

        if (stateData && stateData.length > 0) {
          finalStateId = stateData[0].id;
        } else {
          // Create default workflow states
          const defaultStates = [
            { workspace_id: newTicket.workspace_id, name: 'Backlog', color: '#535353', position: 0, category: 'backlog', is_default: true },
            { workspace_id: newTicket.workspace_id, name: 'Todo', color: '#D48C45', position: 1, category: 'unstarted', is_default: false },
            { workspace_id: newTicket.workspace_id, name: 'In Progress', color: '#1ED760', position: 2, category: 'started', is_default: false },
            { workspace_id: newTicket.workspace_id, name: 'Done', color: '#B37FEB', position: 3, category: 'completed', is_default: false },
          ];
          const { data: createdStates } = await supabase
            .from('workflow_states')
            .insert(defaultStates)
            .select('id');

          if (createdStates && createdStates.length > 0) {
            finalStateId = createdStates[1]?.id || createdStates[0]?.id;
          }
        }
      }

      // 3. Ensure reporter_id
      let finalReporterId = newTicket.reporter_id;
      if (!finalReporterId) {
        const { data: authData } = await supabase.auth.getUser();
        finalReporterId = authData?.user?.id || null;
      }

      // Primary assignee from list or single
      const primaryAssigneeId = (newTicket.assignee_ids && newTicket.assignee_ids.length > 0)
        ? newTicket.assignee_ids[0]
        : (newTicket.assignee_id || null);

      const payload: any = {
        workspace_id: newTicket.workspace_id,
        team_id: finalTeamId,
        title: newTicket.title,
        description: newTicket.description || '',
        priority: newTicket.priority || 'medium',
        assignee_id: primaryAssigneeId,
        project_id: newTicket.project_id || null,
        reporter_id: finalReporterId,
        due_date: newTicket.due_date || null,
      };

      if (finalStateId) {
        payload.state_id = finalStateId;
      }

      // type_id is NOT NULL with no database default, so the caller must supply one.
      // NewTicketModal defaults it to the workspace's is_default type.
      if (newTicket.type_id) {
        payload.type_id = newTicket.type_id;
      }

      const { data: createdTicket, error } = await supabase
        .from('tickets')
        .insert([payload])
        .select(`
          *,
          status:state_id(id, name, color, position, category),
          type:type_id(id, name, color, position, counts_toward_progress)
        `)
        .single();
      
      if (error) {
        console.error('Failed to create ticket:', error);
        throw error;
      }

      // 4. Save multi-assignees in ticket_assignees join table
      const assigneesToSave = newTicket.assignee_ids || (newTicket.assignee_id ? [newTicket.assignee_id] : []);
      if (assigneesToSave.length > 0 && createdTicket) {
        const rows = assigneesToSave.map(uid => ({
          workspace_id: newTicket.workspace_id,
          ticket_id: createdTicket.id,
          user_id: uid
        }));

        try {
          await supabase.from('ticket_assignees').insert(rows);
        } catch (e) {
          console.warn('ticket_assignees insert notice:', e);
        }

        // Notify assigned users
        for (const uid of assigneesToSave) {
          if (uid !== finalReporterId) {
            try {
              await supabase.from('notifications').insert([{
                workspace_id: newTicket.workspace_id,
                recipient_id: uid,
                actor_id: finalReporterId,
                type: 'assignment',
                title: 'Task Assigned',
                message: `You were assigned to task "${newTicket.title}"`,
                entity_type: 'ticket',
                entity_id: createdTicket.id,
                is_read: false
              }]);
            } catch (notifErr) {
              console.warn('Notification send note:', notifErr);
            }
          }
        }
      }

      return createdTicket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['workflow_states'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, workspace_id, assignee_ids, ...updates }: Partial<Ticket> & { id: string, workspace_id: string; assignee_ids?: string[] }) => {
      // If assignee_ids is provided, update ticket_assignees table
      if (assignee_ids !== undefined) {
        try {
          // Remove previous assignees
          await supabase.from('ticket_assignees').delete().eq('ticket_id', id);

          // Add new assignees
          if (assignee_ids.length > 0) {
            const rows = assignee_ids.map(uid => ({
              workspace_id,
              ticket_id: id,
              user_id: uid
            }));
            await supabase.from('ticket_assignees').insert(rows);
          }

          // Set primary assignee
          updates.assignee_id = assignee_ids.length > 0 ? assignee_ids[0] : null;
        } catch (e) {
          console.warn('ticket_assignees update warning:', e);
        }
      }

      const { data, error } = await supabase
        .from('tickets')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    }
  });

  /** Shared shape for every lifecycle mutation below. */
  type TicketRef = { id: string; workspace_id: string };

  /** What the cached ticket queries hold, for the optimistic patch below. */
  type CachedTickets = { data: Ticket[]; count: number } | undefined;

  /** Enough of a workflow state to repaint the badge before the server answers. */
  type StatusPatch = Pick<WorkflowState, 'id' | 'name' | 'color'>;

  const invalidateTickets = () => {
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  };

  /**
   * Manual archive. Backdates closed_at well past the 365-day maximum window so the
   * ticket stays archived even if an admin later widens archive_after_days. This does
   * overwrite the real close date — see the spec's Notes.
   */
  const archiveMutation = useMutation({
    mutationFn: async ({ id }: TicketRef) => {
      const { error } = await supabase
        .from('tickets')
        .update({
          closed_at: daysAgoIso(MANUAL_ARCHIVE_BACKDATE_DAYS),
          unarchived_at: null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: invalidateTickets,
  });

  /** Exempts the ticket from auto-archiving permanently. */
  const unarchiveMutation = useMutation({
    mutationFn: async ({ id }: TicketRef) => {
      const { error } = await supabase
        .from('tickets')
        .update({ unarchived_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: invalidateTickets,
  });

  /** Soft delete — recoverable from the trash bucket. */
  const trashMutation = useMutation({
    mutationFn: async ({ id }: TicketRef) => {
      const { data: authData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('tickets')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: authData?.user?.id || null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: invalidateTickets,
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ id }: TicketRef) => {
      const { error } = await supabase
        .from('tickets')
        .update({ deleted_at: null, deleted_by: null })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: invalidateTickets,
  });

  /**
   * Change a ticket's workflow state, patching every cached ticket query so the badge
   * updates at once and rolling back if the write fails.
   *
   * Kept separate from `updateTicket` on purpose: that one is called by the kanban drag
   * handler, the detail modal and several other places, and none of them should silently
   * acquire optimistic behaviour.
   */
  const setStatusMutation = useMutation({
    mutationFn: async ({ id, state_id }: TicketRef & { state_id: string; status?: StatusPatch }) => {
      const { error } = await supabase
        .from('tickets')
        .update({ state_id })
        .eq('id', id);

      if (error) throw error;
    },
    onMutate: async ({ id, state_id, status }) => {
      // Stop in-flight refetches from overwriting the patch we're about to apply.
      await queryClient.cancelQueries({ queryKey: ['tickets'] });

      const snapshot = queryClient.getQueriesData<CachedTickets>({ queryKey: ['tickets'] });

      queryClient.setQueriesData<CachedTickets>({ queryKey: ['tickets'] }, (old) => {
        if (!old || !Array.isArray(old.data)) return old;
        return {
          ...old,
          data: old.data.map(ticket =>
            ticket.id === id
              ? {
                  ...ticket,
                  state_id,
                  // `status` and `state` are the same joined row; both drive the badge.
                  status: status ? { ...ticket.status, ...status } as WorkflowState : ticket.status,
                  state: status ? { ...ticket.state, ...status } as WorkflowState : ticket.state,
                }
              : ticket
          ),
        };
      });

      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      // Put every cache entry back exactly as it was.
      context?.snapshot.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: () => {
      // Reconciles the patch with the server. If the new state is completed/canceled the
      // closed_at trigger fires and the row may legitimately leave the current bucket.
      invalidateTickets();
    },
  });

  /** Irreversible. RLS restricts this to workspace admins. */
  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ id }: TicketRef) => {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: invalidateTickets,
  });

  return {
    tickets: data?.data || [],
    totalCount: data?.count || 0,
    isLoading,
    error,
    createTicket: createMutation.mutate,
    updateTicket: updateMutation.mutate,
    /**
     * Soft delete, not a hard one. Existing callers keep working and their deletions
     * became recoverable; permanent removal is `deleteTicketPermanently` (admins only).
     */
    deleteTicket: trashMutation.mutate,
    setTicketStatus: setStatusMutation.mutate,
    setTicketStatusAsync: setStatusMutation.mutateAsync,
    archiveTicket: archiveMutation.mutate,
    unarchiveTicket: unarchiveMutation.mutate,
    trashTicket: trashMutation.mutate,
    restoreTicket: restoreMutation.mutate,
    deleteTicketPermanently: permanentDeleteMutation.mutate,
  };
}
