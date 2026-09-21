import { Ticket, Workspace } from '../types/database';

/**
 * Formats a clean human-readable ticket identifier:
 * Format: [WORKSPACE_PREFIX]-[TEAM_KEY]-[NUMBER] (e.g. XXX-DEV-01, RVLT-DEV-01)
 * Defaults to 'XXX' if no workspace prefix is defined.
 */
export function formatTicketIdentifier(ticket: Partial<Ticket>, workspace?: Workspace | null): string {
  const wsPrefix = ((ticket as any)?.workspace?.ticket_prefix || workspace?.ticket_prefix || 'XXX').toUpperCase().trim();
  const teamKey = (ticket.team?.key || ticket.project?.key || '').toUpperCase().trim();
  const num = ticket.ticket_number || 1;
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
  const wsPrefix = (workspace?.ticket_prefix || 'XXX').toUpperCase().trim();
  const tcPrefix = (workspace?.test_case_prefix || 'TC').toUpperCase().trim();
  const num = testCase?.case_number || (typeof index === 'number' ? index + 1 : 1);
  return `${wsPrefix}-${tcPrefix}-${String(num).padStart(2, '0')}`;
}
