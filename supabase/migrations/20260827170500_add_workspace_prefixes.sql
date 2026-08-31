-- ==============================================================================
-- Migration: Add customizable issue and test case prefixes to workspaces
-- ==============================================================================

-- 1. Reset any switched role in current session back to superuser/postgres
RESET ROLE;

-- 2. Add customizable prefix columns to public.workspaces
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS issue_prefix text DEFAULT 'ISS';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS test_case_prefix text DEFAULT 'TC';

-- 3. Backfill default prefixes for existing workspaces
UPDATE public.workspaces
SET issue_prefix = COALESCE(issue_prefix, 'ISS'),
    test_case_prefix = COALESCE(test_case_prefix, 'TC')
WHERE issue_prefix IS NULL OR test_case_prefix IS NULL;
