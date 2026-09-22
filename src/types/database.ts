export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'member';
export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
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
  ticket_prefix?: string;
  test_case_prefix?: string;
  /** Days a closed ticket stays visible before it auto-archives. 1-365, defaults to 7. */
  archive_after_days?: number;
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
  ticket_counter: number;
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
  /** Embedded by useProjects for the progress bar; type_id selects countable types. */
  tickets?: { id: string; state_id: string; type_id: string }[];
  /** Embedded by useProjects. Empty means the workspace flag decides — see ProjectProgressType. */
  progress_types?: { type_id: string }[];
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

/**
 * 'restricted' means the author plus whoever is listed in doc_shares. It replaced
 * 'team' in migration 20260927090000 -- one team only is just a restricted document
 * with a single team share.
 */
export type DocVisibility = 'workspace' | 'restricted' | 'private';
export type DocStatus = 'draft' | 'published' | 'archived';

/** A top-level shelf in the docs tree (Company, Engineering, ...). Added in 005. */
export interface DocCollection {
  id: string;
  workspace_id: string;
  name: string;
  /** lucide-react icon name. */
  icon: string | null;
  color: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Doc {
  id: string;
  workspace_id: string;
  collection_id: string | null;
  parent_id: string | null;
  /** Vestigial. The 'team' visibility it served folded into doc_shares; nothing writes it. */
  team_id: string | null;
  title: string;
  /** Sanitized HTML from the editor. */
  content: string;
  /** Plain-text mirror of `content`, written by the client, used for search. */
  content_text: string;
  /** Emoji. */
  icon: string | null;
  visibility: DocVisibility;
  status: DocStatus;
  position: number;
  created_by: string | null;
  updated_by: string | null;
  /** Soft delete. Setting it cascades to the whole subtree via trigger. */
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  collection?: DocCollection;
  author?: Profile;
  editor?: Profile;
}

/** A doc with its children resolved, built client-side from the flat list. */
export interface DocTreeNode extends Doc {
  children: DocTreeNode[];
  depth: number;
}

/**
 * One grant of access to a restricted document: a person OR a team, never both, with
 * a level. Added in migration 20260927090000.
 *
 * `can_edit` false is a read-only share -- the first time read and write differ on
 * docs, and why its SELECT and UPDATE policies no longer share one predicate.
 */
export interface DocShare {
  id: string;
  workspace_id: string;
  doc_id: string;
  user_id: string | null;
  team_id: string | null;
  can_edit: boolean;
  created_by: string | null;
  created_at: string;
}

export interface DocTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  content: string;
  /** Part of the seeded set. Still editable; the flag drives "reset to default". */
  is_builtin: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A workspace-level ticket type (Bug, Feature, Improvement, plus anything the workspace
 * adds). Added in migration 004.
 */
export interface TicketType {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  position: number;
  /**
   * Whether tickets of this type move the project progress bar, workspace-wide.
   * A project can override this with rows in `project_progress_types`.
   */
  counts_toward_progress: boolean;
  /** The type new tickets get. At most one per workspace. */
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Per-project override of which ticket types count toward progress.
 *
 * No rows for a project means "inherit `ticket_types.counts_toward_progress`", so an
 * unconfigured project behaves exactly as it did before migration 007.
 */
export interface ProjectProgressType {
  workspace_id: string;
  project_id: string;
  type_id: string;
  created_at: string;
}

export interface TicketAssignee {
  workspace_id: string;
  ticket_id: string;
  user_id: string;
  created_at: string;
  profile?: Profile;
}

export interface Ticket {
  id: string;
  workspace_id: string;
  team_id: string;
  project_id: string | null;
  ticket_number: number;
  identifier: string;
  title: string;
  description: string;
  state_id: string;
  type_id: string;
  priority: TicketPriority;
  assignee_id: string | null;
  reporter_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  /** Set by a trigger when the ticket enters a completed/canceled state; cleared on reopen. */
  closed_at: string | null;
  /** Stamped on manual unarchive; exempts the ticket from auto-archiving forever. */
  unarchived_at: string | null;
  /** Soft delete. Non-null means the ticket is in the trash. */
  deleted_at: string | null;
  deleted_by: string | null;
  state?: WorkflowState;
  status?: WorkflowState;
  type?: TicketType;
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
  priority: TicketPriority;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketComment {
  id: string;
  workspace_id: string;
  ticket_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author?: Profile;
}

export interface ActivityLog {
  id: string;
  workspace_id: string;
  entity_type: 'ticket' | 'project' | 'test_case' | 'comment';
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
