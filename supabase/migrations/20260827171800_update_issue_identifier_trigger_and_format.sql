-- ==============================================================================
-- Migration: Dynamic Issue Identifier Structure [WS_PREFIX]-[TEAM_KEY]-[NUMBER]
-- Default: XXX-DEV-01, XXX-ENG-02, XXX-01
-- ==============================================================================

RESET ROLE;

-- 1. Ensure prefix columns exist on public.workspaces with default 'XXX'
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS issue_prefix text DEFAULT 'XXX';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS test_case_prefix text DEFAULT 'TC';

-- 2. Backfill default prefixes for existing workspaces if null
UPDATE public.workspaces
SET issue_prefix = COALESCE(issue_prefix, 'XXX'),
    test_case_prefix = COALESCE(test_case_prefix, 'TC')
WHERE issue_prefix IS NULL OR test_case_prefix IS NULL;

-- 3. Replace the issue identifier generation trigger function
CREATE OR REPLACE FUNCTION public.set_issue_identifier()
RETURNS TRIGGER AS $$
DECLARE
  v_ws_prefix text;
  v_team_key text;
  v_num integer;
BEGIN
  -- Fetch workspace issue prefix (default 'XXX')
  SELECT COALESCE(issue_prefix, 'XXX')
  INTO v_ws_prefix
  FROM public.workspaces
  WHERE id = NEW.workspace_id;

  IF v_ws_prefix IS NULL OR v_ws_prefix = '' THEN
    v_ws_prefix := 'XXX';
  END IF;

  IF NEW.team_id IS NOT NULL THEN
    -- Increment team issue counter atomically
    UPDATE public.teams
    SET issue_counter = issue_counter + 1
    WHERE id = NEW.team_id
    RETURNING key, issue_counter INTO v_team_key, v_num;

    NEW.issue_number := v_num;
    NEW.identifier := UPPER(v_ws_prefix) || '-' || UPPER(COALESCE(v_team_key, 'DEV')) || '-' || LPAD(v_num::text, 2, '0');
  ELSE
    -- For workspace-level issues without a specific team
    NEW.issue_number := COALESCE(NEW.issue_number, 1);
    NEW.identifier := UPPER(v_ws_prefix) || '-' || LPAD(NEW.issue_number::text, 2, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-attach trigger on issues table
DROP TRIGGER IF EXISTS trigger_set_issue_identifier ON public.issues;
CREATE TRIGGER trigger_set_issue_identifier
  BEFORE INSERT ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.set_issue_identifier();

-- 5. Backfill existing issues to the format: [WS_PREFIX]-[TEAM_KEY]-[NUMBER]
UPDATE public.issues i
SET identifier = UPPER(COALESCE(w.issue_prefix, 'XXX')) || '-' || UPPER(COALESCE(t.key, 'DEV')) || '-' || LPAD(COALESCE(i.issue_number, 1)::text, 2, '0')
FROM public.workspaces w
LEFT JOIN public.teams t ON t.id = i.team_id
WHERE i.workspace_id = w.id;
