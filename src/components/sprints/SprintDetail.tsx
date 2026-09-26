import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarRange, CheckCircle2, ListChecks, Loader2, Pencil, Play, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTeams } from '../../hooks/useTeams';
import {
  CATEGORY_LABEL, CATEGORY_ORDER, computeSprintProgress, daysRemaining, describeDaysRemaining,
  groupByProject, parseDate, sprintLabel, useSprintResults, useSprints, useSprintTickets,
} from '../../hooks/useSprints';
import { Sprint, SprintResult, SprintStatus, Team, Ticket } from '../../types/database';
import { formatTicketIdentifier } from '../../lib/identifier';
import { ConfirmModal } from '../common/ConfirmModal';
import { SidebarToggle } from '../layout/SidebarToggle';
import { SprintFormModal } from './SprintFormModal';
import { CompleteSprintModal } from './CompleteSprintModal';
import { SprintPlanning } from './SprintPlanning';

export const formatSprintDate = (iso: string) =>
  parseDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const STATUS_STYLE: Record<SprintStatus, string> = {
  active: 'bg-accent-primary/15 text-accent-primary',
  planned: 'bg-bg-surface-hover text-text-secondary',
  completed: 'bg-bg-surface-hover text-text-tertiary',
};

export const SprintStatusPill: React.FC<{ status: SprintStatus }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[status]}`}>
    {status}
  </span>
);

/** The line under a sprint's name: when it runs and where it stands. */
export const describeSprintWhen = (sprint: Sprint): string => {
  const range = `${formatSprintDate(sprint.start_date)} – ${formatSprintDate(sprint.end_date)}`;
  if (sprint.status === 'active') return `${range} · ${describeDaysRemaining(daysRemaining(sprint))}`;
  if (sprint.status === 'completed' && sprint.completed_at) {
    return `${range} · completed ${new Date(sprint.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return range;
};

/**
 * `/:ws/sprints/:sprintId`. Fetches, then hands everything to SprintDetailBody — the
 * container/presentation split the React rules ask for.
 */
export const SprintDetail: React.FC = () => {
  const { sprintId, workspaceSlug } = useParams<{ sprintId: string; workspaceSlug: string }>();
  const navigate = useNavigate();
  const { currentWorkspace, userRole, setSelectedTicket } = useApp();

  const { sprints, isLoading, error, updateSprint, deleteSprint, startSprint, completeSprint } = useSprints();
  const { teams } = useTeams(currentWorkspace?.id);
  const sprint = (sprints || []).find(s => s.id === sprintId);

  const { tickets, isLoading: ticketsLoading, error: ticketsError } = useSprintTickets(sprint?.id);
  const { results } = useSprintResults(sprint?.id, sprint?.status === 'completed');

  const backToList = () => navigate(`/${workspaceSlug}/sprints`);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-status-error font-medium">Sprints could not be loaded.</p>
          <p className="text-xs text-text-tertiary mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (!sprint) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-text-primary font-medium">This sprint is not available.</p>
          <p className="text-xs text-text-tertiary mt-1 max-w-sm">
            It may have been deleted, or it belongs to a team you are not on.
          </p>
          <button
            type="button"
            onClick={backToList}
            className="mt-4 text-xs text-accent-primary hover:underline focus:outline-none"
          >
            Back to sprints
          </button>
        </div>
      </div>
    );
  }

  return (
    <SprintDetailBody
      sprint={sprint}
      team={(teams || []).find(t => t.id === sprint.team_id)}
      teamSprints={(sprints || []).filter(s => s.team_id === sprint.team_id)}
      tickets={tickets}
      ticketsLoading={ticketsLoading}
      ticketsError={ticketsError ? (ticketsError as Error).message : null}
      results={results}
      isAdmin={userRole === 'admin'}
      workspace={currentWorkspace}
      onBack={backToList}
      onOpenTicket={setSelectedTicket}
      onUpdate={values => updateSprint({ id: sprint.id, ...values })}
      onStart={() => startSprint(sprint.id)}
      onComplete={carryTo => completeSprint({ id: sprint.id, carryTo }).then(() => undefined)}
      onDelete={async () => {
        await deleteSprint(sprint.id);
        backToList();
      }}
    />
  );
};

interface SprintDetailBodyProps {
  sprint: Sprint;
  team?: Team;
  teamSprints: Sprint[];
  tickets: Ticket[];
  ticketsLoading: boolean;
  ticketsError: string | null;
  results: SprintResult[];
  isAdmin: boolean;
  workspace: Parameters<typeof formatTicketIdentifier>[1];
  onBack: () => void;
  onOpenTicket: (ticket: Ticket) => void;
  onUpdate: (values: { name: string; goal: string; start_date: string; end_date: string }) => Promise<void>;
  onStart: () => Promise<void>;
  onComplete: (carryTo: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
}

const SprintDetailBody: React.FC<SprintDetailBodyProps> = ({
  sprint, team, teamSprints, tickets, ticketsLoading, ticketsError, results, isAdmin,
  workspace, onBack, onOpenTicket, onUpdate, onStart, onComplete, onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [busy, setBusy] = useState<'start' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const progress = useMemo(() => computeSprintProgress(tickets), [tickets]);
  const projects = useMemo(() => groupByProject(tickets), [tickets]);
  const byCategory = useMemo(() => {
    const groups = new Map<string, Ticket[]>();
    for (const ticket of tickets) {
      const key = ticket.status?.category || 'backlog';
      groups.set(key, [...(groups.get(key) || []), ticket]);
    }
    return groups;
  }, [tickets]);

  const outcomeCounts = useMemo(() => {
    const counts = { completed: 0, canceled: 0, carried_over: 0, returned_to_backlog: 0 };
    for (const r of results) counts[r.outcome] += 1;
    return counts;
  }, [results]);

  const run = async (kind: 'start' | 'delete', action: () => Promise<void>) => {
    setBusy(kind);
    setActionError(null);
    try {
      await action();
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setActionError(e?.message || 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const canPlan = sprint.status !== 'completed';

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <SidebarToggle />
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors focus:outline-none"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Sprints
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-text-primary truncate">{sprintLabel(sprint)}</h1>
                <SprintStatusPill status={sprint.status} />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <CalendarRange className="w-3.5 h-3.5 shrink-0" />
                {team ? `${team.name} · ` : ''}{describeSprintWhen(sprint)}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors focus:outline-none"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              {canPlan && (
                <button
                  type="button"
                  onClick={() => setIsPlanning(v => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-colors focus:outline-none ${
                    isPlanning ? 'bg-bg-surface-hover text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" /> {isPlanning ? 'Done planning' : 'Plan'}
                </button>
              )}
              {isAdmin && sprint.status === 'planned' && (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  title="Delete sprint"
                  className="p-1.5 rounded-full text-text-tertiary hover:text-status-error hover:bg-bg-surface-hover transition-colors focus:outline-none"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {sprint.status === 'planned' && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run('start', onStart)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors focus:outline-none disabled:opacity-50"
                >
                  {busy === 'start' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Start sprint
                </button>
              )}
              {sprint.status === 'active' && (
                <button
                  type="button"
                  onClick={() => setIsCompleting(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors focus:outline-none"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete sprint
                </button>
              )}
            </div>
          </div>

          {sprint.goal && (
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{sprint.goal}</p>
          )}

          {actionError && (
            <p className="text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
              {actionError}
            </p>
          )}
        </div>

        {/* Planning */}
        {isPlanning && canPlan && <SprintPlanning sprint={sprint} sprintTickets={tickets} />}

        {/* Progress */}
        <div className="bg-bg-surface-raised rounded-lg p-4 sm:p-5 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-primary">Progress</span>
            <span className="text-xs font-semibold text-accent-primary">
              {progress.total > 0 ? `${progress.percent}%` : 'No tickets yet'}
            </span>
          </div>
          <div className="w-full h-2 bg-bg-surface-hover rounded-full overflow-hidden">
            <div className="h-full bg-accent-primary transition-all duration-300" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="text-xs text-text-secondary">
            {progress.done} of {progress.total - progress.canceled} done
            {progress.canceled > 0 && (
              <span className="text-text-tertiary"> · {progress.canceled} canceled, not counted</span>
            )}
          </p>

          {progress.byType.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {progress.byType.map(t => (
                <span key={t.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-bg-surface-hover text-[11px] text-text-secondary">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name} <span className="text-text-tertiary">{t.done}/{t.total}</span>
                </span>
              ))}
            </div>
          )}

          {sprint.status === 'completed' && results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {([
                ['Delivered', outcomeCounts.completed],
                ['Carried over', outcomeCounts.carried_over],
                ['Back to backlog', outcomeCounts.returned_to_backlog],
                ['Canceled', outcomeCounts.canceled],
              ] as const).map(([label, n]) => (
                <div key={label} className="rounded-md bg-bg-surface-hover px-3 py-2">
                  <p className="text-base font-semibold text-text-primary">{n}</p>
                  <p className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</p>
                </div>
              ))}
              <p className="col-span-full text-[11px] text-text-tertiary">
                Committed {results.length} at completion. Carried-over tickets now live in their
                next sprint; this record keeps what this one was accountable for.
              </p>
            </div>
          )}
        </div>

        {/* Projects (derived) */}
        {projects.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-primary">Projects in this sprint</h2>
            <div className="rounded-lg bg-bg-surface-raised divide-y divide-border">
              {projects.map(p => (
                <div key={p.projectId || 'none'} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`flex-1 min-w-0 text-xs truncate ${p.projectId ? 'text-text-primary' : 'text-text-tertiary'}`}>
                    {p.name}
                  </span>
                  <span className="text-[11px] text-text-tertiary shrink-0">{p.done}/{p.total} done</span>
                  <div className="w-20 h-1.5 bg-bg-surface-hover rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full bg-accent-primary"
                      style={{ width: `${p.total > 0 ? Math.round((p.done / p.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tickets */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
            Tickets ({tickets.length})
          </h2>

          {ticketsError ? (
            <p className="text-xs text-status-error">{ticketsError}</p>
          ) : ticketsLoading ? (
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tickets…
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-xs text-text-secondary">No tickets in this sprint.</p>
              {canPlan && (
                <button
                  type="button"
                  onClick={() => setIsPlanning(true)}
                  className="mt-2 text-xs text-accent-primary hover:underline focus:outline-none"
                >
                  Plan it from the team backlog
                </button>
              )}
            </div>
          ) : (
            CATEGORY_ORDER.filter(c => byCategory.has(c)).map(category => (
              <div key={category} className="space-y-1">
                <p className="text-[11px] font-medium text-text-tertiary">
                  {CATEGORY_LABEL[category]} · {byCategory.get(category)!.length}
                </p>
                <div className="rounded-lg bg-bg-surface-raised divide-y divide-border">
                  {byCategory.get(category)!.map(ticket => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => onOpenTicket(ticket)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-surface-hover transition-colors focus:outline-none"
                    >
                      <span className="text-[10px] font-mono text-text-tertiary shrink-0 w-20 truncate">
                        {formatTicketIdentifier(ticket, workspace)}
                      </span>
                      {ticket.status && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ticket.status.color }} />
                      )}
                      <span className="flex-1 min-w-0 text-xs text-text-primary truncate">{ticket.title}</span>
                      {ticket.project && (
                        <span className="hidden sm:block text-[11px] text-text-tertiary truncate max-w-[10rem]">
                          {ticket.project.name}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isEditing && (
        <SprintFormModal
          teamName={team?.name || 'Team'}
          teamSprints={teamSprints}
          sprint={sprint}
          onClose={() => setIsEditing(false)}
          onSubmit={onUpdate}
        />
      )}

      {isCompleting && (
        <CompleteSprintModal
          sprint={sprint}
          tickets={tickets}
          teamSprints={teamSprints}
          onClose={() => setIsCompleting(false)}
          onComplete={onComplete}
        />
      )}

      <ConfirmModal
        isOpen={isConfirmingDelete}
        title={`Delete ${sprintLabel(sprint)}?`}
        message={
          tickets.length > 0
            ? `Its ${tickets.length} ticket${tickets.length === 1 ? '' : 's'} go back to the team backlog. The tickets themselves are not deleted.`
            : 'It has no tickets. This cannot be undone.'
        }
        confirmText="Delete sprint"
        variant="danger"
        icon="trash"
        isLoading={busy === 'delete'}
        onCancel={() => setIsConfirmingDelete(false)}
        // Closed whatever happens: on failure the error renders in the header, which the
        // open dialog would otherwise cover.
        onConfirm={async () => {
          await run('delete', onDelete);
          setIsConfirmingDelete(false);
        }}
      />
    </div>
  );
};
