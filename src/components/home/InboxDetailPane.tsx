import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import {
  X, Send, MessageSquare, Trash2, Calendar, User, Clock, AlertCircle, CheckCircle2
} from 'lucide-react';
import { Issue, Profile, Notification } from '../../types/database';
import { useIssues } from '../../hooks/useIssues';
import { useComments } from '../../hooks/useComments';
import { useProfiles } from '../../hooks/useProfiles';
import { useApp } from '../../context/AppContext';
import { formatIssueIdentifier } from '../../lib/identifier';
import { formatRelativeTime } from '../../lib/time';
import { useImagePaste } from '../../hooks/useImagePaste';
import { ConfirmModal } from '../common/ConfirmModal';

interface InboxDetailPaneProps {
  item: {
    type: 'issue' | 'notification';
    issue?: Issue;
    notification?: Notification;
  };
  onClose?: () => void;
}

export const InboxDetailPane: React.FC<InboxDetailPaneProps> = ({ item, onClose }) => {
  const { currentUser, userRole, currentWorkspace } = useApp();
  const { deleteIssue } = useIssues({ workspaceId: currentWorkspace?.id });
  const { profiles } = useProfiles();

  const issue = item.issue;
  const { comments, addComment, updateComment, deleteComment } = useComments(issue?.id);

  const [newCommentText, setNewCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionContext, setMentionContext] = useState<'new' | 'edit' | null>(null);
  const [mentionSearchTerm, setMentionSearchTerm] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleCommentPaste = useImagePaste(newCommentText, setNewCommentText, textareaRef);
  const handleEditCommentPaste = useImagePaste(editCommentText, setEditCommentText, editTextareaRef);

  // In-app Delete Confirmation State
  const [showDeleteIssueModal, setShowDeleteIssueModal] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  if (!issue) {
    return (
      <div className="flex-1 h-full bg-transparent p-8 flex items-center justify-center text-xs text-text-tertiary">
        Select an item from the inbox to view details.
      </div>
    );
  }

  const currentAssigneeIds: string[] = issue.assignee_ids || (issue.assignee_id ? [issue.assignee_id] : []);
  const assignedProfiles = (profiles || []).filter(p => currentAssigneeIds.includes(p.id));

  const handleSendComment = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newCommentText.trim()) return;
    addComment({ body: newCommentText.trim(), mentionedUserIds });
    setNewCommentText('');
    setMentionedUserIds([]);
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewCommentText(val);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPosition);
    const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbolIndex !== -1) {
      const isStartOrSpace = lastAtSymbolIndex === 0 || /\s/.test(textBeforeCursor[lastAtSymbolIndex - 1]);
      if (isStartOrSpace) {
        const query = textBeforeCursor.slice(lastAtSymbolIndex + 1);
        if (/^[a-zA-Z0-9\s]*$/.test(query)) {
          setMentionSearchTerm(query.toLowerCase());
          setShowMentionPicker(true);
          setMentionContext('new');
          setMentionStartIndex(lastAtSymbolIndex);
          return;
        }
      }
    }
    setShowMentionPicker(false);
    setMentionContext(null);
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionPicker && mentionContext === 'new') {
      if (e.key === 'Escape') {
        setShowMentionPicker(false);
        setMentionContext(null);
        e.preventDefault();
      }
    } else {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendComment();
      }
    }
  };

  const insertMention = (user: Profile) => {
    const handle = (user.full_name || user.email).replace(/\s+/g, '');
    const mentionText = `@${handle} `;

    if (mentionContext === 'new' && mentionStartIndex !== null) {
      const before = newCommentText.slice(0, mentionStartIndex);
      const after = newCommentText.slice(textareaRef.current?.selectionStart || mentionStartIndex);
      setNewCommentText(before + mentionText + after);
      setMentionedUserIds(prev => Array.from(new Set([...prev, user.id])));
      setShowMentionPicker(false);
      setMentionContext(null);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            mentionStartIndex + mentionText.length,
            mentionStartIndex + mentionText.length
          );
        }
      }, 0);
    }
  };

  const filteredMentionables = (profiles || []).filter(p => {
    const name = (p.full_name || '').toLowerCase();
    const email = (p.email || '').toLowerCase();
    return name.includes(mentionSearchTerm) || email.includes(mentionSearchTerm);
  });

  const renderCommentBody = (body: string) => {
    const mentionRegex = /(@[a-zA-Z0-9_]+)/g;
    const parts = body.split(mentionRegex);

    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const handle = part.slice(1).toLowerCase();
        const user = (profiles || []).find(p => {
          const uHandle = (p.full_name || '').replace(/\s+/g, '').toLowerCase();
          const eHandle = (p.email || '').split('@')[0].toLowerCase();
          return uHandle === handle || eHandle === handle;
        });

        const isCurrentUser = user && currentUser && user.id === currentUser.id;

        return (
          <span 
            key={i} 
            className={
              isCurrentUser 
                ? 'font-medium cursor-default px-1 py-0.5 rounded-sm text-[11px] bg-status-warning/20 text-status-warning' 
                : 'text-text-primary font-medium hover:underline cursor-default'
            }
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const priorityColors: Record<string, string> = {
    urgent: 'text-status-error bg-status-error/10 border-status-error/30',
    high: 'text-status-warning bg-status-warning/10 border-status-warning/30',
    medium: 'text-accent-primary bg-accent-primary/10 border-accent-primary/30',
    low: 'text-text-secondary bg-bg-surface-raised border-border',
    none: 'text-text-tertiary bg-bg-surface border-border',
  };

  const renderDueDateBadge = (dueDateStr?: string | null) => {
    if (!dueDateStr) return <span className="text-text-tertiary">No due date set</span>;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const formatted = due.toLocaleDateString();

    const isCompleted = issue.status?.category === 'completed' || issue.status?.category === 'canceled';
    if (isCompleted) {
      return (
        <span className="text-text-tertiary text-xs">
          {formatted}
        </span>
      );
    }

    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-status-error bg-bg-surface-raised border border-transparent px-2 py-0.5 rounded-full">
          <AlertCircle className="w-3.5 h-3.5 text-status-error shrink-0" />
          <span>Overdue {Math.abs(diffDays)}d ({formatted})</span>
        </span>
      );
    }

    if (diffDays === 0) {
      return (
        <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-status-warning bg-bg-surface-raised border border-transparent px-2 py-0.5 rounded-full">
          <Clock className="w-3.5 h-3.5 text-status-warning shrink-0" />
          <span>Due Today ({formatted})</span>
        </span>
      );
    }

    if (diffDays <= 2) {
      return (
        <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-status-warning bg-bg-surface-raised border border-transparent px-2 py-1 rounded-sm">
          <Clock className="w-3.5 h-3.5 text-status-warning shrink-0" />
          <span>{diffDays}d left ({formatted})</span>
        </span>
      );
    }

    return (
      <div className="text-xs text-text-primary flex items-center space-x-1.5">
        <Calendar className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        <span>{formatted}</span>
      </div>
    );
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-transparent overflow-hidden">
      {/* Pane Subheader Toolbar */}
      <div className="px-6 py-3.5 border-b border-border bg-transparent flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <span className="font-id text-xs font-semibold px-2 py-0.5 rounded-full bg-bg-surface-raised border border-transparent text-text-secondary shrink-0">
            {formatIssueIdentifier(issue, currentWorkspace)}
          </span>
          <span className="text-xs text-text-tertiary">Task Overview</span>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {(userRole === 'admin' || issue.reporter_id === currentUser?.id) && (
            <button
              onClick={() => setShowDeleteIssueModal(true)}
              className="p-1.5 rounded-full text-text-secondary hover:text-status-error hover:bg-bg-surface transition-colors"
              title="Delete Issue"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Pane Body: 2 Columns */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border no-scrollbar scrollbar-none">
        {/* Main Column: Single Unified Content & Discussion Section */}
        <div className="lg:col-span-2 p-6 space-y-6 overflow-y-auto no-scrollbar scrollbar-none">
          {/* Unified Issue & Discussion Container */}
          <div className="space-y-4">
            {/* Primary Issue Card: Title + Metadata + Description Together */}
            <div className="bg-bg-surface-raised border border-transparent rounded-lg p-6 space-y-4 shadow-xs">
              {/* Header with Title and Reporter info */}
              <div className="space-y-3 pb-4 border-b border-border/60">
                <div>
                  <h1 className="text-base md:text-lg font-semibold text-text-primary">
                    {issue.title}
                  </h1>
                </div>

                {(() => {
                  const reporter = issue.reporter || (issue.reporter_id ? profiles?.find(p => p.id === issue.reporter_id) : null);
                  const reporterName = reporter?.full_name || reporter?.email || 'User';
                  return (
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <div className="flex items-center space-x-2">
                        <img
                          src={reporter?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(reporterName)}&background=282828&color=B3B3B3&rounded=true`}
                          alt="Reporter"
                          className="w-5 h-5 rounded-full object-cover shrink-0"
                        />
                        <span className="font-medium text-text-primary">
                          {reporterName}
                        </span>
                        <span className="text-text-tertiary">opened this issue</span>
                      </div>
                      <span className="text-[11px] text-text-tertiary">
                        {formatRelativeTime(issue.created_at)}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Description Body */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Description
                </h3>
                {issue.description ? (
                  <div
                    className="prose text-xs text-text-primary leading-relaxed break-words pt-1"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(issue.description) }}
                  />
                ) : (
                  <div className="text-xs text-text-tertiary italic pt-1">
                    No description provided for this issue.
                  </div>
                )}
              </div>
            </div>

            {/* Discussion Thread */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Discussion ({(comments || []).length})</span>
              </div>

              {(comments || []).map((comment: any) => {
                const fullName = currentUser?.full_name || '';
                const email = currentUser?.email || '';
                const possibleMentions = [
                  `@${fullName}`,
                  `@${fullName.replace(/\s+/g, '')}`,
                  `@${fullName.split(' ')[0]}`,
                  `@${email}`,
                  `@${email.split('@')[0]}`
                ].filter(m => m.length > 1).map(m => m.toLowerCase());
                
                const isMentioned = possibleMentions.some(m => comment.body.toLowerCase().includes(m));
                const canEdit = currentUser && (comment.author_id === currentUser.id || userRole === 'admin');
                const isEditing = editingCommentId === comment.id;

                return (
                  <div 
                    key={comment.id} 
                    className={`group/comment p-3.5 rounded-lg border space-y-1.5 transition-colors relative ${
                      isMentioned && !isEditing
                        ? 'bg-status-warning/10 border-status-warning/30' 
                        : 'bg-bg-surface border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <img
                          src={comment.author?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author?.full_name)}&background=282828&color=B3B3B3&rounded=true`}
                          alt="Author"
                          className="w-4 h-4 rounded-full object-cover shrink-0"
                        />
                        <span className="text-xs font-medium text-text-primary">
                          {comment.author?.full_name || 'User'}
                        </span>
                        <span className="text-[10px] text-text-tertiary">
                          {formatRelativeTime(comment.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {!isEditing && canEdit && (
                          <div className="opacity-0 group-hover/comment:opacity-100 flex items-center space-x-1 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingCommentId(comment.id);
                                setEditCommentText(comment.body);
                              }}
                              className="p-1 text-text-tertiary hover:text-text-primary rounded-full hover:bg-bg-surface-hover transition-colors"
                              title="Edit comment"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeletingCommentId(comment.id)}
                              className="p-1 text-text-tertiary hover:text-status-error rounded-full hover:bg-bg-surface-hover transition-colors"
                              title="Delete comment"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          ref={editTextareaRef}
                          rows={2}
                          value={editCommentText}
                          onChange={e => setEditCommentText(e.target.value)}
                          onPaste={handleEditCommentPaste}
                          className="w-full text-xs bg-bg-surface-raised border border-transparent rounded-sm p-2 text-text-primary focus:outline-none focus:border-text-secondary"
                        />
                        <div className="flex justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => setEditingCommentId(null)}
                            className="px-2.5 py-1 rounded-full text-xs text-text-secondary hover:bg-bg-surface-hover"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (editCommentText.trim()) {
                                updateComment({ id: comment.id, body: editCommentText.trim() });
                                setEditingCommentId(null);
                              }
                            }}
                            className="px-3 py-1 rounded-full bg-accent-primary text-button-text text-xs font-semibold hover:bg-accent-primary-hover"
                          >
                            Update
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
                        {renderCommentBody(comment.body)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Comment Input */}
              <form onSubmit={handleSendComment} className="flex items-start space-x-2.5 pt-2">
                <img
                  src={currentUser?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.full_name || 'User')}&background=282828&color=B3B3B3&rounded=true`}
                  alt="You"
                  className="w-5 h-5 rounded-full object-cover mt-1 shrink-0"
                />
                <div className="flex-1 relative">
                  {showMentionPicker && mentionContext === 'new' && filteredMentionables.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto bg-bg-surface-raised border border-transparent rounded-md shadow-lg z-50 py-1">
                      {filteredMentionables.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => insertMention(p)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-bg-surface-hover flex items-center space-x-2 transition-colors"
                        >
                          <img
                            src={p.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.full_name || p.email)}&background=282828&color=B3B3B3&rounded=true`}
                            alt="Avatar"
                            className="w-5 h-5 rounded-full object-cover shrink-0"
                          />
                          <span className="text-text-primary font-medium truncate">{p.full_name || p.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    placeholder="Reply in discussion... (Type @ to mention, Enter to submit)"
                    value={newCommentText}
                    onChange={handleCommentChange}
                    onKeyDown={handleCommentKeyDown}
                    onPaste={handleCommentPaste}
                    className="w-full text-xs bg-bg-surface-raised border border-transparent rounded-md pl-2.5 pr-8 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                  />
                  <button
                    type="submit"
                    disabled={!newCommentText.trim()}
                    className="absolute right-2 bottom-2 p-1 rounded-sm text-text-secondary hover:text-accent-primary disabled:opacity-40 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Sidebar Column: Metadata (View-Only) */}
        <div className="p-6 space-y-5 bg-transparent overflow-y-auto no-scrollbar scrollbar-none">
          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Status
            </label>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-sm bg-bg-surface-raised border border-transparent text-xs font-medium text-text-primary">
                {issue.status?.name || 'Backlog'}
              </span>
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Priority
            </label>
            <div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-sm text-xs font-medium capitalize border ${priorityColors[issue.priority] || priorityColors.medium}`}>
                {issue.priority || 'medium'}
              </span>
            </div>
          </div>

          {/* Assignees */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Assignees ({assignedProfiles.length})
            </label>
            <div className="space-y-1.5">
              {assignedProfiles.length === 0 ? (
                <div className="text-xs text-text-tertiary px-2.5 py-1.5 bg-bg-surface-raised border border-transparent rounded-sm">
                  No assignees
                </div>
              ) : (
                assignedProfiles.map(u => (
                  <div
                    key={u.id}
                    className="flex items-center space-x-2 px-2.5 py-1.5 bg-bg-surface-raised border border-transparent rounded-sm text-xs"
                  >
                    <img
                      src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || u.email)}&background=282828&color=B3B3B3&rounded=true`}
                      alt="Avatar"
                      className="w-4 h-4 rounded-full object-cover shrink-0"
                    />
                    <span className="text-text-primary truncate font-medium">{u.full_name || u.email}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Due Date
            </label>
            <div className="pt-0.5">
              {renderDueDateBadge(issue.due_date)}
            </div>
          </div>

          {/* Story Points */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Estimate (Points)
            </label>
            <div className="text-xs text-text-primary px-2.5 py-1.5 bg-bg-surface-raised border border-transparent rounded-sm">
              {issue.estimate !== null && issue.estimate !== undefined ? `${issue.estimate} points` : 'Not estimated'}
            </div>
          </div>

          {/* Timestamps & Reporter */}
          <div className="pt-4 border-t border-border space-y-2 text-xs text-text-secondary">
            <div className="flex justify-between">
              <span>Created</span>
              <span className="font-medium text-text-primary">
                {new Date(issue.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Reporter</span>
              <span className="font-medium text-text-primary">
                {(issue.reporter?.full_name || issue.reporter?.email) ||
                  (issue.reporter_id ? profiles?.find(p => p.id === issue.reporter_id)?.full_name || profiles?.find(p => p.id === issue.reporter_id)?.email : null) ||
                  'System'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Issue In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteIssueModal}
        title="Delete Issue"
        message={`Are you sure you want to delete this issue "${issue.title}"? This action will permanently remove the issue and its activity.`}
        confirmText="Delete Issue"
        variant="danger"
        onConfirm={() => {
          deleteIssue({ id: issue.id, workspace_id: issue.workspace_id });
          setShowDeleteIssueModal(false);
          if (onClose) onClose();
        }}
        onCancel={() => setShowDeleteIssueModal(false)}
      />

      {/* Delete Comment In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingCommentId}
        title="Delete Comment"
        message="Are you sure you want to delete this comment? This cannot be undone."
        confirmText="Delete Comment"
        variant="danger"
        onConfirm={() => {
          if (deletingCommentId) {
            deleteComment(deletingCommentId);
            setDeletingCommentId(null);
          }
        }}
        onCancel={() => setDeletingCommentId(null)}
      />
    </div>
  );
};
