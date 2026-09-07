export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'member';
export type IssuePriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type StateCategory = 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
export type ProjectStatus = 'planned' | 'in_progress' | 'paused' | 'completed' | 'canceled';
export type TestCaseStatus = 'draft' | 'untested' | 'passed' | 'failed';
export type NotificationType = 'assignment' | 'mention' | 'status_change' | 'comment' | 'workspace_invite';
export type MemberStatus = 'pending' | 'accepted' | 'declined';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  issue_prefix?: string;
  test_case_prefix?: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: UserRole;
  status: MemberStatus;
  joined_at: string;
  profile?: Profile;
}

export interface Team {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  icon: string;
  description: string | null;
  issue_counter: number;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  workspace_id: string;
  team_id: string;
  user_id: string;
  created_at: string;
  team?: Team;
  profile?: Profile;
}

export interface WorkflowState {
  id: string;
  workspace_id: string;
  team_id: string;
  name: string;
  color: string;
  position: number;
  category: StateCategory;
  is_default: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  workspace_id: string;
  team_id: string;
  name: string;
  key: string;
  description: string | null;
  status: ProjectStatus;
  lead_id: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
  lead?: Profile;
  issues?: { id: string; state_id: string }[];
}

export interface RoadmapItem {
  id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  start_date: string | null;
  target_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  project?: Project;
}

export interface IssueAssignee {
  workspace_id: string;
  issue_id: string;
  user_id: string;
  created_at: string;
  profile?: Profile;
}

export interface Issue {
  id: string;
  workspace_id: string;
  team_id: string;
  project_id: string | null;
  issue_number: number;
  identifier: string;
  title: string;
  description: string;
  state_id: string;
  priority: IssuePriority;
  assignee_id: string | null;
  reporter_id: string | null;
  due_date: string | null;
  estimate: number | null;
  created_at: string;
  updated_at: string;
  state?: WorkflowState;
  status?: WorkflowState;
  assignee?: Profile;
  assignees?: Profile[];
  assignee_ids?: string[];
  reporter?: Profile;
  project?: Project;
  team?: Team;
}

export interface TestCase {
  id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  preconditions: string;
  steps: string;
  expected_result: string;
  status: TestCaseStatus;
  priority: IssuePriority;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueComment {
  id: string;
  workspace_id: string;
  issue_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author?: Profile;
}

export interface ActivityLog {
  id: string;
  workspace_id: string;
  entity_type: 'issue' | 'project' | 'test_case' | 'comment';
  entity_id: string;
  actor_id: string | null;
  action: string;
  changes: Record<string, any>;
  created_at: string;
  actor?: Profile;
}

export interface Notification {
  id: string;
  workspace_id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  is_read: boolean;
  created_at: string;
  actor?: Profile;
}
