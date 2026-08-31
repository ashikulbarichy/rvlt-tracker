import { Issue, Workspace } from '../types/database';

/**
 * Formats a clean human-readable issue identifier:
 * Format: [WORKSPACE_PREFIX]-[TEAM_KEY]-[NUMBER] (e.g. XXX-DEV-01, RVLT-DEV-01)
 * Defaults to 'XXX' if no workspace prefix is defined.
 */
export function formatIssueIdentifier(issue: Partial<Issue>, workspace?: Workspace | null): string {
  const wsPrefix = ((issue as any)?.workspace?.issue_prefix || workspace?.issue_prefix || 'XXX').toUpperCase().trim();
  const teamKey = (issue.team?.key || issue.project?.key || '').toUpperCase().trim();
  const num = issue.issue_number || 1;
  const formattedNum = String(num).padStart(2, '0');

  if (teamKey) {
    return `${wsPrefix}-${teamKey}-${formattedNum}`;
  }
  return `${wsPrefix}-${formattedNum}`;
}

/**
 * Formats a clean test case identifier:
 * Format: [WORKSPACE_PREFIX]-[TEST_PREFIX]-[NUMBER] (e.g. XXX-TC-01, RVLT-TC-01)
 */
export function formatTestCaseIdentifier(testCase: any, index?: number, workspace?: Workspace | null): string {
  const wsPrefix = (workspace?.issue_prefix || 'XXX').toUpperCase().trim();
  const tcPrefix = (workspace?.test_case_prefix || 'TC').toUpperCase().trim();
  const num = testCase?.case_number || (typeof index === 'number' ? index + 1 : 1);
  return `${wsPrefix}-${tcPrefix}-${String(num).padStart(2, '0')}`;
}
