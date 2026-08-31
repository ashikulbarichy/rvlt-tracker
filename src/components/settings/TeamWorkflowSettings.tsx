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
    '#726A5C', // Backlog neutral
    '#D48C45', // Orange
    '#C7A242', // Yellow
    '#4A7BB5', // Blue
    '#6B9E6D', // Green
    '#B55151', // Red
    '#805A96', // Purple
    '#5C7272', // Slate
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
            className="flex items-center justify-between p-3 bg-bg-surface border border-border rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <div
                className="w-3 h-3 rounded-full border border-border"
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
