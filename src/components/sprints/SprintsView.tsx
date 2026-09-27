import React, { useState } from 'react';
import { VelocityChart } from './VelocityChart';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, ListOrdered, Loader2, Plus, Timer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTeams } from '../../hooks/useTeams';
import { isSprintArchived, SprintProgress, sprintLabel, useSprints, useSprintTicketCounts, useVelocityHistory } from '../../hooks/useSprints';
import { Sprint, Team } from '../../types/database';
import { SidebarToggle } from '../layout/SidebarToggle';
import { SprintFormModal } from './SprintFormModal';
import { describeSprintWhen, SprintStatusPill } from './SprintDetail';

/**
 * `/:ws/sprints` (every team you can see) and `/:ws/teams/:teamId/sprints` (one team).
 *
 * Sprints are grouped by team because a sprint IS a team's: one active at a time, its
 * own numbering. RLS already limits the list to teams you are on (admins see all), so
 * there is no client-side team filtering beyond the route.
 */
export const SprintsView: React.FC = () => {
  const { teamId: routeTeamId, workspaceSlug } = useParams<{ teamId?: string; workspaceSlug: string }>();
  const navigate = useNavigate();
  const { currentWorkspace } = useApp();

  const { sprints, isLoading, error, createSprint } = useSprints();
  const { teams, isLoading: teamsLoading } = useTeams(currentWorkspace?.id);
  const { bySprint } = useSprintTicketCounts();

  const visibleTeams = (teams || []).filter(t => !routeTeamId || t.id === routeTeamId);

  if (isLoading || teamsLoading) {
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

  return (
    <SprintsList
      title={routeTeamId ? `${visibleTeams[0]?.name || 'Team'} sprints` : 'Sprints'}
      teams={visibleTeams}
      sprints={sprints || []}
      progressBySprint={bySprint}
      onOpen={sprint => navigate(`/${workspaceSlug}/sprints/${sprint.id}`)}
      onBacklog={team => navigate(`/${workspaceSlug}/teams/${team.id}/backlog`)}
      onCreate={async (team, values) => {
        const created = await createSprint({ team_id: team.id, ...values });
        navigate(`/${workspaceSlug}/sprints/${created.id}`);
      }}
    />
  );
};

interface SprintsListProps {
  title: string;
  teams: Team[];
  sprints: Sprint[];
  progressBySprint: Map<string, SprintProgress>;
  onOpen: (sprint: Sprint) => void;
  onBacklog: (team: Team) => void;
  onCreate: (team: Team, values: { name: string; goal: string; start_date: string; end_date: string }) => Promise<void>;
}

const SprintsList: React.FC<SprintsListProps> = ({ title, teams, sprints, progressBySprint, onOpen, onBacklog, onCreate }) => {
  const [creatingFor, setCreatingFor] = useState<Team | null>(null);

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-3 sm:px-6 pt-2.5 sm:pt-3 pb-8 space-y-8">
        <div className="flex items-center gap-2.5">
          <SidebarToggle />
          <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        </div>

        {teams.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <Timer className="w-5 h-5 mx-auto text-text-tertiary" />
            <p className="mt-2 text-sm text-text-primary">You are not on any team yet.</p>
            <p className="mt-1 text-xs text-text-tertiary">Sprints belong to teams. Join one to plan sprints.</p>
          </div>
        ) : (
          teams.map(team => (
            <TeamSprints
              key={team.id}
              team={team}
              sprints={sprints.filter(s => s.team_id === team.id)}
              progressBySprint={progressBySprint}
              onOpen={onOpen}
              onNew={() => setCreatingFor(team)}
              onBacklog={() => onBacklog(team)}
            />
          ))
        )}
      </div>

      {creatingFor && (
        <SprintFormModal
          teamName={creatingFor.name}
          teamSprints={sprints.filter(s => s.team_id === creatingFor.id)}
          onClose={() => setCreatingFor(null)}
          onSubmit={values => onCreate(creatingFor, values)}
        />
      )}
    </div>
  );
};

/** Committed against completed points for the team's last sprints with estimates. */
const TeamVelocityCard: React.FC<{ teamId: string }> = ({ teamId }) => {
  const { history, isLoading, error } = useVelocityHistory(teamId);
  if (isLoading || (!error && history.length === 0)) return null;
  return (
    <div className="bg-bg-surface-raised rounded-lg p-4 space-y-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-primary">Velocity</span>
      {error ? (
        <p className="text-xs text-status-error">{(error as Error).message}</p>
      ) : (
        <VelocityChart history={history} />
      )}
    </div>
  );
};

const TeamSprints: React.FC<{
  team: Team;
  sprints: Sprint[];
  progressBySprint: Map<string, SprintProgress>;
  onOpen: (sprint: Sprint) => void;
  onNew: () => void;
  onBacklog: () => void;
}> = ({ team, sprints, progressBySprint, onOpen, onNew, onBacklog }) => {
  const [showCompleted, setShowCompleted] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = sprints.filter(s => s.status === 'active');
  const planned = sprints
    .filter(s => s.status === 'planned')
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const finished = sprints
    .filter(s => s.status === 'completed')
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const completed = finished.filter(s => !isSprintArchived(s));
  const archived = finished.filter(s => isSprintArchived(s));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text-primary truncate">{team.name}</h2>
        <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onBacklog}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-surface-raised hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-medium transition-colors focus:outline-none"
        >
          <ListOrdered className="w-3.5 h-3.5" /> Backlog
        </button>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors focus:outline-none shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> New sprint
        </button>
        </div>
      </div>

      {sprints.length === 0 ? (
        <p className="text-xs text-text-tertiary px-1">No sprints yet.</p>
      ) : (
        // Two columns on wide screens: what is running now beside what is next and done.
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-2 min-w-0">
            {active.map(s => (
              <SprintRow key={s.id} sprint={s} progress={progressBySprint.get(s.id)} onOpen={onOpen} emphasis />
            ))}
            {active.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-text-tertiary">
                No sprint running.
              </p>
            )}
            {finished.length > 0 && <TeamVelocityCard teamId={team.id} />}
          </div>

          <div className="space-y-4 min-w-0">
            {planned.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-text-tertiary px-1">Upcoming</p>
                {planned.map(s => (
                  <SprintRow key={s.id} sprint={s} progress={progressBySprint.get(s.id)} onOpen={onOpen} />
                ))}
              </div>
            )}

            {completed.length > 0 && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setShowCompleted(v => !v)}
                  className="flex items-center gap-1 text-[11px] font-medium text-text-tertiary hover:text-text-secondary px-1 focus:outline-none"
                >
                  {showCompleted ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Completed · {completed.length}
                </button>
                {showCompleted &&
                  completed.map(s => (
                    <SprintRow key={s.id} sprint={s} progress={progressBySprint.get(s.id)} onOpen={onOpen} />
                  ))}
              </div>
            )}

            {archived.length > 0 && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setShowArchived(v => !v)}
                  className="flex items-center gap-1 text-[11px] font-medium text-text-tertiary hover:text-text-secondary px-1 focus:outline-none"
                  title="Completed sprints archive themselves 7 days after completing"
                >
                  {showArchived ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Archived · {archived.length}
                </button>
                {showArchived &&
                  archived.map(s => (
                    <SprintRow key={s.id} sprint={s} progress={progressBySprint.get(s.id)} onOpen={onOpen} />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

const SprintRow: React.FC<{
  sprint: Sprint;
  progress?: SprintProgress;
  onOpen: (sprint: Sprint) => void;
  emphasis?: boolean;
}> = ({ sprint, progress, onOpen, emphasis = false }) => {
  const total = progress?.total ?? 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(sprint)}
      className={`w-full text-left rounded-lg px-4 py-3 transition-colors focus:outline-none ${
        emphasis
          ? 'bg-bg-surface-raised border border-accent-primary/30 hover:bg-bg-surface-hover'
          : 'bg-bg-surface-raised hover:bg-bg-surface-hover'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">{sprintLabel(sprint)}</span>
            <SprintStatusPill status={sprint.status} />
          </div>
          <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{describeSprintWhen(sprint)}</p>
        </div>
        <span className="text-[11px] text-text-secondary shrink-0">
          {total === 0
            ? 'No tickets'
            : sprint.status === 'completed'
              ? `${progress?.done ?? 0} delivered`
              : `${progress?.done ?? 0}/${total - (progress?.canceled ?? 0)} · ${progress?.percent ?? 0}%${
                  progress && progress.points.total > 0 ? ` · ${progress.points.done}/${progress.points.total - progress.points.canceled} pts` : ''
                }`}
        </span>
      </div>

      {sprint.status !== 'completed' && total > 0 && (
        <div className="mt-2.5 w-full h-1.5 bg-bg-surface-hover rounded-full overflow-hidden">
          <div className="h-full bg-accent-primary" style={{ width: `${progress?.percent ?? 0}%` }} />
        </div>
      )}

      {emphasis && sprint.goal && (
        <p className="mt-2 text-xs text-text-secondary line-clamp-2">{sprint.goal}</p>
      )}
    </button>
  );
};
