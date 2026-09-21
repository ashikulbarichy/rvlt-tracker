import React from 'react';
import { useWorkflowStates } from '../../hooks/useWorkflowStates';
import { Loader2 } from 'lucide-react';
import { WorkflowState } from '../../types/database';

interface WorkspaceWorkflowSettingsProps {
  /** Non-admins see the palette read-only; RLS enforces this independently. */
  canEdit?: boolean;
}

/**
 * Colours for the workspace's issue statuses.
 *
 * Workspace-level since migration 003: one set of statuses shared by every team, so this
 * lives in workspace settings rather than under an individual team. Changing a colour
 * here changes it on every board.
 */
export const WorkspaceWorkflowSettings: React.FC<WorkspaceWorkflowSettingsProps> = ({ canEdit = false }) => {
  const { workflowStates, isLoading, updateWorkflowState } = useWorkflowStates();
  const [error, setError] = React.useState<string | null>(null);

  const predefinedColors = [
    '#535353', // Backlog neutral
    '#FFA42B', // Orange (warning token)
    '#F5C842', // Yellow (attention token)
    '#4C8DFF', // Blue (accent token)
    '#1ED760', // Green (success token)
    '#F15E6C', // Red (error token)
    '#B37FEB', // Purple
    '#509BF5', // Sky (info token)
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (!workflowStates || workflowStates.length === 0) {
    return null;
  }

  const handleColorChange = async (state: WorkflowState, newColor: string) => {
    if (!canEdit || state.color === newColor) return;
    setError(null);
    try {
      await updateWorkflowState(state.id, { color: newColor });
    } catch (err: unknown) {
      // The manage policy is is_workspace_admin, so a non-admin write fails here even if
      // the UI were bypassed. Surface it rather than logging to a console nobody reads.
      const e = err as { message?: string } | null;
      setError(e?.message || 'Failed to update the status colour.');
    }
  };

  return (
    <div className="space-y-3 font-sans mt-8 pt-8 border-t border-border">
      <div>
        <h2 className="text-sm font-karla font-semibold text-text-primary">Workflow States</h2>
        <p className="text-xs text-text-secondary">
          {canEdit
            ? 'Shared across the whole workspace \u2014 changing a colour updates every team\u2019s board.'
            : 'Status colours are shared across the workspace. Only admins can change them.'}
        </p>
      </div>

      {error && (
        <div className="text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {workflowStates.map((state) => (
          <div
            key={state.id}
            className="flex items-center justify-between p-3 bg-bg-surface-raised border border-transparent rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <div
                className="w-3 h-3 rounded-full border border-transparent"
                style={{ backgroundColor: state.color }}
              />
              <div>
                <div className="text-sm font-medium text-text-primary">{state.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
                  {state.category}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {predefinedColors.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(state, color)}
                  disabled={!canEdit}
                  className={`w-5 h-5 rounded-full border transition-transform ${canEdit ? 'hover:scale-110' : 'cursor-default opacity-70'} ${
                    state.color === color
                      ? 'border-text-primary ring-1 ring-text-primary/50'
                      : 'border-border/60 hover:border-text-secondary'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
