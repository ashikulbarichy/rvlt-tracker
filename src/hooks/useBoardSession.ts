import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { BoardSession, BoardVote } from '../types/database';

// One shared empty list. `data || []` would hand out a new array on every render, and
// anything keyed on it (a memo, an effect) would then re-run on every render -- which is
// exactly how a board once looped a thousand renders a second and starved navigation.
const NO_VOTES: BoardVote[] = [];

/** Seconds left on the board timer at `now`, or null when no timer is set. */
export function timerRemaining(session: BoardSession | null | undefined, now = Date.now()): number | null {
  if (!session) return null;
  // `!= null` on purpose: a row written before a column existed reads back undefined.
  if (session.timer_paused_remaining != null) return session.timer_paused_remaining;
  if (!session.timer_ends_at) return null;
  return Math.max(0, Math.ceil((new Date(session.timer_ends_at).getTime() - now) / 1000));
}

/** Total votes per element for a round, and how many the given user spent. */
export function tallyVotes(votes: BoardVote[], userId?: string) {
  const totals = new Map<string, number>();
  const mine = new Map<string, number>();
  let mineUsed = 0;
  for (const v of votes) {
    totals.set(v.element_id, (totals.get(v.element_id) || 0) + v.votes);
    if (v.user_id === userId) {
      mine.set(v.element_id, v.votes);
      mineUsed += v.votes;
    }
  }
  return { totals, mine, mineUsed };
}

/**
 * The shared timer and dot voting for one whiteboard.
 *
 * Editors run the session (RLS on doc_boards); anyone who can see the board may vote,
 * and a trigger keeps each voter inside the round's budget. `onChanged` tells the others
 * on the board to refetch.
 */
export function useBoardSession(
  docId: string | undefined,
  userId: string | undefined,
  onChanged?: (kind: 'session' | 'votes') => void
) {
  const queryClient = useQueryClient();
  const sessionKey = ['board', docId, 'session'];

  const sessionQuery = useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doc_boards')
        .select('*')
        .eq('doc_id', docId!)
        .maybeSingle();
      if (error) throw error;
      return (data as BoardSession | null) ?? null;
    },
    enabled: !!docId,
  });

  const session = sessionQuery.data ?? null;
  const round = session?.voting_round ?? 0;
  const votesKey = ['board', docId, 'votes', round];

  const votesQuery = useQuery({
    queryKey: votesKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doc_board_votes')
        .select('*')
        .eq('doc_id', docId!)
        .eq('voting_round', round);
      if (error) throw error;
      return (data || []) as BoardVote[];
    },
    enabled: !!docId && round > 0,
  });

  const updateSession = useMutation({
    mutationFn: async (patch: Partial<BoardSession>) => {
      const { error } = await supabase
        .from('doc_boards')
        .upsert(
          { doc_id: docId, ...patch, updated_by: userId ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'doc_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', docId, 'session'] });
      void queryClient.invalidateQueries({ queryKey: ['board', docId, 'votes'] });
      onChanged?.('session');
    },
  });

  /** Set my votes on one element to `count`; zero takes them back. */
  const setMyVotes = useMutation({
    mutationFn: async ({ elementId, count }: { elementId: string; count: number }) => {
      if (!session?.voting_open) throw new Error('Voting is not open.');
      if (count <= 0) {
        const { error } = await supabase
          .from('doc_board_votes')
          .delete()
          .eq('doc_id', docId!)
          .eq('voting_round', round)
          .eq('element_id', elementId)
          .eq('user_id', userId!);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('doc_board_votes')
        .upsert(
          { doc_id: docId, voting_round: round, element_id: elementId, user_id: userId, votes: count },
          { onConflict: 'doc_id,voting_round,element_id,user_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', docId, 'votes'] });
      onChanged?.('votes');
    },
  });

  const clearVotes = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('doc_board_votes')
        .delete()
        .eq('doc_id', docId!)
        .eq('voting_round', round);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['board', docId, 'votes'] });
      onChanged?.('votes');
    },
  });

  return {
    session,
    votes: votesQuery.data ?? NO_VOTES,
    isLoading: sessionQuery.isLoading,
    error: sessionQuery.error || votesQuery.error,
    updateSession: updateSession.mutateAsync,
    setMyVotes: setMyVotes.mutateAsync,
    clearVotes: clearVotes.mutateAsync,
    refetchSession: () => queryClient.invalidateQueries({ queryKey: ['board', docId, 'session'] }),
    refetchVotes: () => queryClient.invalidateQueries({ queryKey: ['board', docId, 'votes'] }),
  };
}
