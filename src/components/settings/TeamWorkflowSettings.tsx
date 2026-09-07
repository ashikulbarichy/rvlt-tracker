import React from 'react';
import { useWorkflowStates } from '../../hooks/useWorkflowStates';
import { Loader2 } from 'lucide-react';
import { WorkflowState } from '../../types/database';

interface TeamWorkflowSettingsProps {
  teamId: string;
}

export const TeamWorkflowSettings: React.FC<TeamWorkflowSettingsProps> = ({ teamId }) => {
  const { workflowStates, isLoading, updateWorkflowState } = useWorkflowStates(teamId);

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
    if (state.color === newColor) return;
    try {
      await updateWorkflowState(state.id, { color: newColor });
    } catch (error) {
      console.error('Failed to update workflow state color:', error);
    }
  };

  return (
    <div className="space-y-3 font-sans mt-8 pt-8 border-t border-border">
      <div>
        <h2 className="text-sm font-karla font-semibold text-text-primary">Workflow States</h2>
        <p className="text-xs text-text-secondary">
          Customize the color for each issue state to help identify them at a glance.
        </p>
      </div>

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
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
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
