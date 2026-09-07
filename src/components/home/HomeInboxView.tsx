import React, { useState, useMemo, useEffect } from 'react';
import {
  Inbox,
  AlertCircle,
  Flame,
  CheckCircle2,
  Clock,
  MessageSquare,
  Mail,
  Filter,
  Search,
  CheckCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SidebarToggle } from '../../components/layout/SidebarToggle';
import { useIssues } from '../../hooks/useIssues';
import { useNotifications } from '../../hooks/useNotifications';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import { InboxFeedItem, FeedItemData } from './InboxFeedItem';
import { InboxDetailPane } from './InboxDetailPane';
import { formatRelativeTime } from '../../lib/time';
import { stripHtml } from '../../utils/htmlUtils';

type TriageFilter = 'all' | 'urgent' | 'assigned' | 'activity';

export const HomeInboxView: React.FC = () => {
  const { currentWorkspace, currentUser, setSelectedIssue } = useApp();
  const { issues, isLoading: isLoadingIssues } = useIssues({
    workspaceId: currentWorkspace?.id,
    limit: 100
  });
  const { notifications, isLoading: isLoadingNotifs, markAllAsRead, markAsRead, removeNotification } = useNotifications();
  const { getUserTeams } = useTeamMembers(currentWorkspace?.id);
  const userRole = useApp().userRole;
  const isAdmin = userRole === 'admin' || currentWorkspace?.created_by === currentUser?.id;
  const userAssignedTeams = currentUser ? getUserTeams(currentUser.id) : [];

  const [activeFilter, setActiveFilter] = useState<TriageFilter>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Build Unified Feed Items (Tasks, deadlines, priority, and task activities only)
  const allFeedItems: FeedItemData[] = useMemo(() => {
    const items: FeedItemData[] = [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Process Issues
    issues.forEach(issue => {
      // Don't show closed/completed tasks in the inbox feed
      const isCompleted = issue.status?.category === 'completed' || issue.status?.category === 'canceled';
      if (isCompleted) return;

      if (!isAdmin && userAssignedTeams.length > 0) {
        if (!userAssignedTeams.some(t => t.id === issue.team_id)) return;
      }
      if (!isAdmin && userAssignedTeams.length === 0) {
        return;
      }

      let urgencyType: FeedItemData['urgencyType'] = 'normal';
      let urgencyLabel: string | undefined;

      if (issue.due_date && !isCompleted) {
        const dueDate = new Date(issue.due_date);
        const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          urgencyType = 'overdue';
          urgencyLabel = `Overdue ${Math.abs(diffDays)}d`;
        } else if (diffDays === 0 || issue.due_date === todayStr) {
          urgencyType = 'due_today';
          urgencyLabel = 'Due Today';
        } else if (diffDays <= 2) {
          urgencyType = 'due_soon';
          urgencyLabel = `Due in ${diffDays}d`;
        }
      } else if (issue.priority === 'urgent' && !isCompleted) {
        urgencyType = 'urgent_priority';
        urgencyLabel = 'Urgent';
      }

      // Format relative time
      const timeAgo = issue.updated_at
        ? formatRelativeTime(issue.updated_at)
        : 'Just now';

      items.push({
        id: `issue-${issue.id}`,
        type: 'issue',
        issue,
        title: issue.title,
        subtitle: issue.description ? stripHtml(issue.description).substring(0, 80) : undefined,
        urgencyType,
        urgencyLabel,
        timestamp: timeAgo,
      });
    });

    // Process Task-related Notifications only (Comments, mentions, assignment changes)
    (notifications || []).forEach(n => {
      // Exclude workspace invitations and notifications for other workspaces
      if (n.workspace_id && currentWorkspace && n.workspace_id !== currentWorkspace.id) return;
      
      const isInvite = n.type === 'workspace_invite' || n.entity_type === 'workspace_invitation';
      if (isInvite) return;

      const isComment = n.type === 'comment' || n.type === 'mention';

      // Find matching issue if entity_type is issue
      const matchedIssue = issues.find(i => i.id === n.entity_id);

      items.push({
        id: `notif-${n.id}`,
        type: 'notification',
        issue: matchedIssue,
        notification: n,
        title: n.title || 'Task Update',
        subtitle: n.message,
        urgencyType: isComment ? 'comment' : 'normal',
        timestamp: formatRelativeTime(n.created_at),
        isRead: n.is_read
      });
    });

    // Sort items by priority/urgency: overdue first, then due today, then urgent, then timestamp
    return items.sort((a, b) => {
      const urgencyRank = (type?: string) => {
        switch (type) {
          case 'overdue': return 1;
          case 'due_today': return 2;
          case 'due_soon': return 3;
          case 'urgent_priority': return 4;
          case 'comment': return 5;
          default: return 6;
        }
      };
      return urgencyRank(a.urgencyType) - urgencyRank(b.urgencyType);
    });
  }, [issues, notifications]);

  // 2. Filter feed items
  const filteredFeedItems = useMemo(() => {
    return allFeedItems.filter(item => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesSubtitle = item.subtitle?.toLowerCase().includes(q);
        const matchesId = item.issue?.identifier?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubtitle && !matchesId) return false;
      }

      // Tab filter
      switch (activeFilter) {
        case 'urgent':
          return item.urgencyType === 'overdue' || item.urgencyType === 'due_today' || item.urgencyType === 'due_soon' || item.urgencyType === 'urgent_priority';
        case 'assigned':
          if (!currentUser) return false;
          return item.issue && (item.issue.assignee_id === currentUser.id || item.issue.assignee_ids?.includes(currentUser.id));
        case 'activity':
          return item.urgencyType === 'comment' || item.type === 'notification';
        case 'all':
        default:
          return true;
      }
    });
  }, [allFeedItems, activeFilter, searchQuery, currentUser]);

  // 3. Auto-select first item if current selection is invalid or null
  const selectedItem = useMemo(() => {
    if (!filteredFeedItems || filteredFeedItems.length === 0) return null;
    if (selectedItemId) {
      const found = filteredFeedItems.find(i => i.id === selectedItemId);
      if (found) return found;
    }
    return null;
  }, [filteredFeedItems, selectedItemId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedItemId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const unreadCount = (notifications || []).filter(n => !n.is_read).length;
  const urgentCount = allFeedItems.filter(i => i.urgencyType === 'overdue' || i.urgencyType === 'due_today' || i.urgencyType === 'urgent_priority').length;

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-transparent">
      {/* Tier 2: Triage Feed Column (340px - 380px) */}
      <div className="w-80 md:w-96 shrink-0 border-r border-border flex flex-col bg-transparent h-full overflow-hidden">
        {/* Feed Header */}
        <div className="p-3.5 border-b border-border bg-transparent space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <SidebarToggle />
              <Inbox className="w-4 h-4 text-text-primary" />
              <h1 className="text-sm font-semibold text-text-primary font-karla">
                Home
              </h1>
              {urgentCount > 0 && (
                <span className="px-1.5 py-0.5 bg-status-error text-white text-[10px] font-semibold rounded-full">
                  {urgentCount} urgent
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-[11px] text-accent-primary hover:underline flex items-center space-x-1"
                title="Mark all notifications as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark read</span>
              </button>
            )}
          </div>

          {/* Search in Feed */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter triage feed..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-xs bg-bg-surface-raised border border-transparent rounded-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
            />
          </div>

          {/* Triage Filter Chips */}
          <div className="flex space-x-1 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
            {[
              { id: 'all', label: 'All' },
              { id: 'urgent', label: 'Urgent & Due' },
              { id: 'assigned', label: 'Assigned' },
              { id: 'activity', label: 'Activity' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id as TriageFilter)}
                className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                  activeFilter === tab.id
                    ? 'bg-text-primary text-button-text font-medium shadow-xs'
                    : 'bg-bg-surface text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feed List Items */}
        <div className="flex-1 overflow-y-auto">
          {(isLoadingIssues || isLoadingNotifs) ? (
            <div className="p-8 text-center text-xs text-text-secondary">
              Loading triage feed...
            </div>
          ) : filteredFeedItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-secondary space-y-2">
              <CheckCircle2 className="w-8 h-8 text-status-success mx-auto opacity-70" />
              <div className="font-medium text-text-primary">All caught up!</div>
              <div className="text-[11px] text-text-tertiary">
                No pending urgent tasks or unread notifications.
              </div>
            </div>
          ) : (
            filteredFeedItems.map(item => (
              <InboxFeedItem
                key={item.id}
                item={item}
                isSelected={selectedItem?.id === item.id}
                onSelect={() => {
                  setSelectedItemId(item.id);
                  if (item.type === 'notification' && item.notification && !item.isRead) {
                    markAsRead(item.notification.id);
                  }
                }}
                onRemove={item.type === 'notification' && item.notification ? (e) => {
                  e.stopPropagation();
                  removeNotification(item.notification!.id);
                  if (selectedItem?.id === item.id) setSelectedItemId(null);
                } : undefined}
              />
            ))
          )}
        </div>
      </div>

      {/* Tier 3: Inline Detail Pane (Right Column) */}
      <div className="flex-1 h-full overflow-hidden flex flex-col">
        {selectedItem ? (
          <InboxDetailPane
            item={{
              type: selectedItem.type,
              issue: selectedItem.issue,
              notification: selectedItem.notification
            }}
          />
        ) : (
          <div className="flex-1 h-full bg-transparent flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-bg-surface-raised border border-transparent flex items-center justify-center text-status-success">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary font-karla">
              Inbox Zero
            </h3>
            <p className="text-xs text-text-secondary max-w-sm">
              All tasks and activity have been triaged. Pick an item from the left stream to inspect details.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
