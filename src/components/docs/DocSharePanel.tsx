import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Search, Users2, X } from 'lucide-react';
import { DocShare, Profile, Team } from '../../types/database';
import { WorkspaceMemberWithProfile } from '../../hooks/useWorkspaceMembers';
import { CustomSelect } from '../common/CustomSelect';

interface DocSharePanelProps {
  shares: DocShare[];
  isLoading: boolean;
  /** Non-null when the share list could not be read. */
  loadError: string | null;
  members: WorkspaceMemberWithProfile[];
  teams: Team[];
  /** The author always has access and is never listed as a share. */
  authorId: string | null;
  onGrant: (principal: { userId?: string; teamId?: string }, canEdit: boolean) => Promise<void>;
  onRevoke: (shareId: string) => Promise<void>;
}

const LEVEL_OPTIONS = [
  { value: 'view', label: 'Can view' },
  { value: 'edit', label: 'Can edit' },
];

const displayName = (profile?: Profile | null) =>
  profile?.full_name || profile?.email || 'Unknown member';

/**
 * The people and teams a restricted document is shared with.
 *
 * Rendered only for someone who can manage access — the author or a workspace admin.
 * Everyone else gets a one-line summary instead, because RLS returns them only the
 * share rows that name them, and a partial list presented as the full one is worse
 * than no list.
 */
export const DocSharePanel: React.FC<DocSharePanelProps> = ({
  shares,
  isLoading,
  loadError,
  members,
  teams,
  authorId,
  onGrant,
  onRevoke,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  const sharedUserIds = useMemo(
    () => new Set(shares.filter(s => s.user_id).map(s => s.user_id as string)),
    [shares]
  );
  const sharedTeamIds = useMemo(
    () => new Set(shares.filter(s => s.team_id).map(s => s.team_id as string)),
    [shares]
  );

  // The author is excluded: they always have access, so offering to "share" with them
  // would create a row that grants nothing and can then be revoked misleadingly.
  const candidateMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      // Pending invitees are excluded: useWorkspaceMembers returns them alongside real
      // members, but every docs policy starts with is_workspace_member, so a share
      // granted to someone who has not accepted yet grants nothing.
      .filter(m => m.status !== 'pending')
      .filter(m => m.user_id !== authorId && !sharedUserIds.has(m.user_id))
      .filter(m => {
        if (!q) return true;
        const name = m.profile?.full_name?.toLowerCase() || '';
        const email = m.profile?.email?.toLowerCase() || '';
        return name.includes(q) || email.includes(q);
      });
  }, [members, authorId, sharedUserIds, query]);

  // Shares carry ids only; the names live in the member and team lists this panel is
  // already given. Resolving here avoids a second query and an embed the database
  // cannot express.
  const profileById = useMemo(
    () => new Map(members.map(m => [m.user_id, m.profile])),
    [members]
  );
  const teamById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

  const candidateTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams
      .filter(t => !sharedTeamIds.has(t.id))
      .filter(t => !q || t.name.toLowerCase().includes(q));
  }, [teams, sharedTeamIds, query]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusyId(key);
    setWriteError(null);
    try {
      await action();
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setWriteError(e?.message || 'That change could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  const grant = (principal: { userId?: string; teamId?: string }) => {
    const key = principal.userId || principal.teamId || '';
    // New shares start read-only. Granting more than asked for is the wrong default
    // for a control whose whole job is limiting access.
    void run(key, () => onGrant(principal, false));
    setQuery('');
    setIsAdding(false);
  };

  return (
    <div className="rounded-md border border-border bg-bg-surface-raised/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Shared with
        </span>
        <button
          type="button"
          onClick={() => { setIsAdding(v => !v); setQuery(''); }}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors focus:outline-none"
        >
          {isAdding ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {isAdding ? 'Done' : 'Add people'}
        </button>
      </div>

      {loadError && (
        <p className="text-[11px] text-status-error bg-status-error/10 border border-status-error/30 rounded px-2 py-1.5">
          {loadError}
        </p>
      )}

      {writeError && (
        <p className="text-[11px] text-status-error bg-status-error/10 border border-status-error/30 rounded px-2 py-1.5">
          {writeError}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 py-1.5 text-[11px] text-text-tertiary">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading who has access…
        </div>
      ) : shares.length === 0 ? (
        <p className="text-[11px] text-text-tertiary">
          Only you can see this document. Add people or teams below.
        </p>
      ) : (
        <div className="space-y-1">
          {shares.map(share => {
            const isTeam = !!share.team_id;
            const profile = share.user_id ? profileById.get(share.user_id) : null;
            const label = isTeam
              ? teamById.get(share.team_id as string)?.name || 'Unknown team'
              : displayName(profile);
            const busy = busyId === share.id;

            return (
              <div key={share.id} className="flex items-center gap-2">
                {isTeam ? (
                  <span className="w-5 h-5 shrink-0 rounded-full bg-bg-surface-hover flex items-center justify-center">
                    <Users2 className="w-3 h-3 text-text-tertiary" />
                  </span>
                ) : (
                  <img
                    src={
                      profile?.avatar_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=282828&color=B3B3B3&rounded=true`
                    }
                    alt=""
                    className="w-5 h-5 shrink-0 rounded-full object-cover"
                  />
                )}

                <span className="flex-1 min-w-0 text-xs text-text-primary truncate">
                  {label}
                  {isTeam && <span className="text-text-tertiary"> · team</span>}
                </span>

                <CustomSelect
                  value={share.can_edit ? 'edit' : 'view'}
                  options={LEVEL_OPTIONS}
                  disabled={busy}
                  onChange={val =>
                    run(share.id, () =>
                      onGrant(
                        share.user_id ? { userId: share.user_id } : { teamId: share.team_id as string },
                        val === 'edit'
                      )
                    )
                  }
                  size="xs"
                  className="w-24 shrink-0"
                />

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(share.id, () => onRevoke(share.id))}
                  title="Remove access"
                  className="p-1 shrink-0 rounded text-text-tertiary hover:text-status-error transition-colors focus:outline-none disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isAdding && (
        <div className="pt-1 space-y-1.5 border-t border-border">
          <div className="relative mt-1.5">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search people and teams…"
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary"
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {candidateTeams.map(team => (
              <button
                key={team.id}
                type="button"
                disabled={busyId === team.id}
                onClick={() => grant({ teamId: team.id })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary transition-colors focus:outline-none"
              >
                <Users2 className="w-3 h-3 shrink-0 text-text-tertiary" />
                <span className="truncate">{team.name}</span>
                <span className="ml-auto text-[10px] text-text-tertiary shrink-0">team</span>
              </button>
            ))}

            {candidateMembers.map(member => (
              <button
                key={member.user_id}
                type="button"
                disabled={busyId === member.user_id}
                onClick={() => grant({ userId: member.user_id })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary transition-colors focus:outline-none"
              >
                <img
                  src={
                    member.profile?.avatar_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName(member.profile))}&background=282828&color=B3B3B3&rounded=true`
                  }
                  alt=""
                  className="w-4 h-4 shrink-0 rounded-full object-cover"
                />
                <span className="truncate">{displayName(member.profile)}</span>
              </button>
            ))}

            {candidateTeams.length === 0 && candidateMembers.length === 0 && (
              <p className="px-2 py-2 text-[11px] text-text-tertiary">
                {query.trim() ? 'Nobody matches that.' : 'Everyone already has access.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
