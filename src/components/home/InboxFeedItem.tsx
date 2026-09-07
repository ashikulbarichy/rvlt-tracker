import React from 'react';
import { Issue, Notification, Profile } from '../../types/database';
import { AlertCircle, Clock, MessageSquare, Flame, AlertTriangle, ChevronsUp, Equal, ChevronDown, Minus, X } from 'lucide-react';
import { formatIssueIdentifier } from '../../lib/identifier';
import { StatusBadge } from '../common/StatusBadge';

export interface FeedItemData {
  id: string;
  type: 'issue' | 'notification';
  issue?: Issue;
  notification?: Notification;
  title: string;
  subtitle?: string;
  urgencyType?: 'overdue' | 'due_today' | 'due_soon' | 'urgent_priority' | 'comment' | 'normal';
  urgencyLabel?: string;
  timestamp: string;
  isRead?: boolean;
}

interface InboxFeedItemProps {
  item: FeedItemData;
  isSelected: boolean;
  onSelect: () => void;
  onRemove?: (e: React.MouseEvent) => void;
}

export const InboxFeedItem: React.FC<InboxFeedItemProps> = ({ item, isSelected, onSelect, onRemove }) => {
  const getUrgencyBadge = () => {
    switch (item.urgencyType) {
      case 'overdue':
        return (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-status-error/15 text-status-error border border-transparent ">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>{item.urgencyLabel || 'Overdue'}</span>
          </span>
        );
      case 'due_today':
        return (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-status-warning/15 text-status-warning border border-transparent ">
            <Clock className="w-3 h-3 shrink-0" />
            <span>{item.urgencyLabel || 'Due Today'}</span>
          </span>
        );
      case 'due_soon':
        return (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-status-warning/10 text-status-warning">
            <Clock className="w-3 h-3 shrink-0" />
            <span>{item.urgencyLabel || 'Due Soon'}</span>
          </span>
        );
      case 'urgent_priority':
        return null;
      case 'comment':
        return (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-status-info/15 text-status-info">
            <MessageSquare className="w-3 h-3 shrink-0" />
            <span>Activity</span>
          </span>
        );
      default:
        return null;
    }
  };

  const getPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return <span title="Urgent Priority"><AlertTriangle className="w-3.5 h-3.5 text-status-error shrink-0" /></span>;
      case 'high':
        return <span title="High Priority"><ChevronsUp className="w-3.5 h-3.5 text-status-warning shrink-0" /></span>;
      case 'medium':
        return <span title="Medium Priority"><Equal className="w-3.5 h-3.5 text-status-attention shrink-0" /></span>;
      case 'low':
        return <span title="Low Priority"><ChevronDown className="w-3.5 h-3.5 text-status-info shrink-0" /></span>;
      default:
        return <span title="No Priority"><Minus className="w-3.5 h-3.5 text-text-tertiary shrink-0" /></span>;
    }
  };

  const issue = item.issue;

  return (
    <div
      onClick={onSelect}
      className={`p-3 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-bg-surface-hover' : 'bg-bg-surface-raised hover:bg-bg-surface-hover'}`}
    >
      {/* Top row: Identifier / Type + Urgency Badge + Time */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center space-x-2 min-w-0">
          {getPriorityIcon(issue?.priority)}
          {issue && (
            <span className="font-id text-[11px] font-semibold text-text-secondary">
              {formatIssueIdentifier(issue)}
            </span>
          )}
          {getUrgencyBadge()}
        </div>

        <div className="flex items-center space-x-2 shrink-0 ml-2">
          <span className="text-[10px] text-text-tertiary">
            {item.timestamp}
          </span>
          {item.isRead === false && (
            <div className="w-2 h-2 rounded-full bg-accent-primary" title="Unread" />
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-text-tertiary hover:text-status-error transition-colors p-0.5 rounded-sm hover:bg-bg-surface-hover"
              title="Remove notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Middle row: Title */}
      <h4 className="text-xs font-semibold text-text-primary line-clamp-2 mb-1 font-sans leading-snug">
        {item.title}
      </h4>

      {/* Subtitle / Actor note if any */}
      {item.subtitle && (
        <p className="text-[11px] text-text-secondary truncate mb-1.5">
          {item.subtitle}
        </p>
      )}

      {/* Bottom row: Status & Assignees */}
      {issue && (
        <div className="flex items-center justify-between">
          <StatusBadge name={issue.status?.name || 'Todo'} color={issue.status?.color} size="xs" />

          {issue.assignees && issue.assignees.length > 0 ? (
            <div className="flex -space-x-1.5 overflow-hidden">
              {issue.assignees.slice(0, 2).map((a: Profile, idx: number) => (
                <img
                  key={a.id || idx}
                  src={a.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.full_name || a.email)}&background=282828&color=B3B3B3&rounded=true`}
                  alt={a.full_name || 'Assignee'}
                  className="w-4 h-4 rounded-full object-cover"
                  title={a.full_name || a.email}
                />
              ))}
              {issue.assignees.length > 2 && (
                <span className="w-4 h-4 rounded-full bg-border text-[9px] font-medium text-text-primary flex items-center justify-center">
                  +{issue.assignees.length - 2}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-text-tertiary">Unassigned</span>
          )}
        </div>
      )}
    </div>
  );
};
