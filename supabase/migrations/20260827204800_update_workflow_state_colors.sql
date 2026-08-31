-- Migration to update workflow state colors to desaturated defaults

-- 1. Update the seed function with new colors
CREATE OR REPLACE FUNCTION public.seed_default_team_workflow_states(p_team_id uuid, p_workspace_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.workflow_states (workspace_id, team_id, name, color, position, category, is_default)
  VALUES
    (p_workspace_id, p_team_id, 'Backlog', '#726A5C', 0, 'backlog', true),
    (p_workspace_id, p_team_id, 'Todo', '#D48C45', 1, 'unstarted', false),
    (p_workspace_id, p_team_id, 'In Progress', '#C7A242', 2, 'started', false),
    (p_workspace_id, p_team_id, 'In Review', '#4A7BB5', 3, 'started', false),
    (p_workspace_id, p_team_id, 'Done', '#6B9E6D', 4, 'completed', false),
    (p_workspace_id, p_team_id, 'Canceled', '#B55151', 5, 'canceled', false)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update existing states with the new default colors based on their name
UPDATE public.workflow_states
SET color = CASE
  WHEN name = 'Todo' THEN '#D48C45'
  WHEN name = 'In Progress' THEN '#C7A242'
  WHEN name = 'In Review' THEN '#4A7BB5'
  WHEN name = 'Done' THEN '#6B9E6D'
  WHEN name = 'Canceled' THEN '#B55151'
  ELSE color
END
WHERE name IN ('Todo', 'In Progress', 'In Review', 'Done', 'Canceled');
