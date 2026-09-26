import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { RichTextEditor } from '../common/RichTextEditor';
import { CustomSelect } from '../common/CustomSelect';
import { DatePicker } from '../common/DatePicker';
import {
  X, Trash2, Send, Edit3, MessageSquare, Plus, Check, Users, ArrowLeft, Calendar, Clock, AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TicketPriority } from '../../types/database';
import { useTickets } from '../../hooks/useTickets';
import { useWorkflowStates } from '../../hooks/useWorkflowStates';
import { useTicketTypes } from '../../hooks/useTicketTypes';
import { useProfiles } from '../../hooks/useProfiles';
import { useComments } from '../../hooks/useComments';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import { formatTicketIdentifier } from '../../lib/identifier';
import { formatRelativeTime } from '../../lib/time';
import { useImagePaste } from '../../hooks/useImagePaste';
import { ConfirmModal } from '../common/ConfirmModal';
import { SprintPicker } from '../common/SprintPicker';

export const TicketDetailModal: React.FC = () => {
  const {
    selectedTicket,
    setSelectedTicket,
    currentUser,
    userRole,
    currentWorkspace
  } = useApp();

  const [displayedTicket, setDisplayedTicket] = useState<any>(selectedTicket);
  const [isOpen, setIsOpen] = useState(false);

  React.useEffect(() => {
    if (selectedTicket) {
      setDisplayedTicket(selectedTicket);
      const raf = requestAnimationFrame(() => {
        setIsOpen(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsOpen(false);
      const timer = setTimeout(() => {
        setDisplayedTicket(null);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [selectedTicket]);

  const handleClose = React.useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      setSelectedTicket(null);
      setDisplayedTicket(null);
    }, 220);
  }, [setSelectedTicket]);

  const activeTicket = selectedTicket || displayedTicket;

  const { updateTicket, updateTicketAsync, deleteTicket } = useTickets({ workspaceId: currentWorkspace?.id });
  const { workflowStates } = useWorkflowStates();
  const { ticketTypes } = useTicketTypes();
  const { profiles } = useProfiles();
  const { comments, addComment, updateComment, deleteComment } = useComments(activeTicket?.id);

  const [descriptionText, setDescriptionText] = useState(activeTicket?.description || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(activeTicket?.title || '');
  const [newCommentText, setNewCommentText] = useState('');
  const [isAssigneePickerOpen, setIsAssigneePickerOpen] = useState(false);
  const assigneePickerRef = React.useRef<HTMLDivElement>(null);

  // Close the assignee picker when clicking outside of it
  React.useEffect(() => {
    if (!isAssigneePickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node)) {
        setIsAssigneePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAssigneePickerOpen]);
  const [prevTicketId, setPrevTicketId] = useState(activeTicket?.id);

  if (activeTicket?.id !== prevTicketId) {
    setDescriptionText(activeTicket?.description || '');
    setTitleText(activeTicket?.title || '');
    setIsEditingTitle(false);
    setPrevTicketId(activeTicket?.id);
    setNewCommentText('');
  }
  
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  
  // In-app Delete Confirmation State
  const [showDeleteTicketModal, setShowDeleteTicketModal] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionContext, setMentionContext] = useState<'new' | 'edit' | null>(null);
  const [mentionSearchTerm, setMentionSearchTerm] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  
  const handleCommentPaste = useImagePaste(newCommentText, setNewCommentText, textareaRef);
  const handleEditCommentPaste = useImagePaste(editCommentText, setEditCommentText, editTextareaRef);
  
  const { getTeamUsers } = useTeamMembers(currentWorkspace?.id);
  const teamMembers = activeTicket?.team_id ? getTeamUsers(activeTicket.team_id) : [];
  const mentionableProfiles = teamMembers.map(tm => tm.profile).filter(Boolean) as any[];

  // Update local title and description text when ticket changes
  React.useEffect(() => {
    if (activeTicket) {
      if (activeTicket.title !== titleText && !isEditingTitle) setTitleText(activeTicket.title || '');
    }
  }, [activeTicket?.title]);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (selectedTicket || isOpen) && !isEditingTitle && !showMentionPicker && !isAssigneePickerOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTicket, isOpen, isEditingTitle, showMentionPicker, isAssigneePickerOpen, handleClose]);

  if (!activeTicket) return null;

  const ticketComments = comments || [];
  const teamStates = workflowStates || [];

  // Derive assignees
  const currentAssigneeIds: string[] = activeTicket.assignee_ids || (activeTicket.assignee_id ? [activeTicket.assignee_id] : []);
  const assignedProfiles = (profiles || []).filter(p => currentAssigneeIds.includes(p.id));

  const handleSaveTitle = (newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === activeTicket.title) {
      setTitleText(activeTicket.title);
      setIsEditingTitle(false);
      return;
    }
    updateTicket({ id: activeTicket.id, workspace_id: activeTicket.workspace_id, title: trimmed });
    setSelectedTicket({ ...activeTicket, title: trimmed });
    setDisplayedTicket({ ...activeTicket, title: trimmed });
    setIsEditingTitle(false);
  };

  const handleSaveDescription = () => {
    updateTicket({ id: activeTicket.id, workspace_id: activeTicket.workspace_id, description: descriptionText });
    setSelectedTicket({ ...activeTicket, description: descriptionText });
    setDisplayedTicket({ ...activeTicket, description: descriptionText });
  };

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

  const insertMention = (profile: any) => {
    if (mentionStartIndex === null) return;
    const before = newCommentText.slice(0, mentionStartIndex);
    const after = newCommentText.slice(textareaRef.current?.selectionStart || newCommentText.length);
    
    // Format mention without spaces for easy parsing (e.g., @JaneDoe)
    const mentionName = (profile.full_name || profile.email).replace(/\s+/g, '');
    const mentionText = `@${mentionName} `;
    
    setNewCommentText(before + mentionText + after);
    setMentionedUserIds(prev => Array.from(new Set([...prev, profile.id])));
    setShowMentionPicker(false);
    setMentionContext(null);
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + mentionText.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleEditCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditCommentText(val);

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
          setMentionContext('edit');
          setMentionStartIndex(lastAtSymbolIndex);
          return;
        }
      }
    }
    setShowMentionPicker(false);
    setMentionContext(null);
  };

  const insertEditMention = (profile: any) => {
    if (mentionStartIndex === null) return;
    const before = editCommentText.slice(0, mentionStartIndex);
    const after = editCommentText.slice(editTextareaRef.current?.selectionStart || editCommentText.length);
    
    const mentionName = (profile.full_name || profile.email).replace(/\s+/g, '');
    const mentionText = `@${mentionName} `;
    
    setEditCommentText(before + mentionText + after);
    setShowMentionPicker(false);
    setMentionContext(null);
    
    setTimeout(() => {
      if (editTextareaRef.current) {
        const newPos = before.length + mentionText.length;
        editTextareaRef.current.setSelectionRange(newPos, newPos);
        editTextareaRef.current.focus();
      }
    }, 0);
  };

  const filteredMentionables = mentionableProfiles.filter(p => 
    (p.full_name?.toLowerCase().includes(mentionSearchTerm) || p.email?.toLowerCase().includes(mentionSearchTerm))
  );

  const renderCommentBody = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(@[a-zA-Z0-9_-]+)/g);
    
    const fullName = currentUser?.full_name || '';
    const email = currentUser?.email || '';
    const possibleMentions = [
      `@${fullName}`,
      `@${fullName.replace(/\s+/g, '')}`,
      `@${fullName.split(' ')[0]}`,
      `@${email}`,
      `@${email.split('@')[0]}`
    ].filter(m => m.length > 1).map(m => m.toLowerCase());

    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const isCurrentUser = possibleMentions.includes(part.toLowerCase());
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

  const handleUpdateField = (field: string, value: any) => {
    if (!activeTicket) return;
    updateTicket({ id: activeTicket.id, workspace_id: activeTicket.workspace_id, [field]: value });
    setSelectedTicket({ ...activeTicket, [field]: value });
    setDisplayedTicket({ ...activeTicket, [field]: value });
  };

  /**
   * Unlike handleUpdateField this awaits the write and lets it reject: the database
   * refuses a sprint of another team or a completed one, and SprintPicker shows why.
   * Local state changes only after the write succeeds.
   */
  const handleSetSprint = async (sprintId: string | null) => {
    if (!activeTicket) return;
    await updateTicketAsync({ id: activeTicket.id, workspace_id: activeTicket.workspace_id, sprint_id: sprintId });
    setSelectedTicket({ ...activeTicket, sprint_id: sprintId });
    setDisplayedTicket({ ...activeTicket, sprint_id: sprintId });
  };

  const handleToggleAssignee = (userId: string) => {
    if (!activeTicket) return;
    let newAssigneeIds: string[];
    if (currentAssigneeIds.includes(userId)) {
      newAssigneeIds = currentAssigneeIds.filter(id => id !== userId);
    } else {
      newAssigneeIds = [...currentAssigneeIds, userId];
    }

    const updatedProfiles = (profiles || []).filter(p => newAssigneeIds.includes(p.id));
    updateTicket({
      id: activeTicket.id,
      workspace_id: activeTicket.workspace_id,
      assignee_ids: newAssigneeIds,
    });
    const updated = {
      ...activeTicket,
      assignee_ids: newAssigneeIds,
      assignees: updatedProfiles,
      assignee_id: newAssigneeIds[0] || null,
      assignee: updatedProfiles[0] || null
    };
    setSelectedTicket(updated);
    setDisplayedTicket(updated);
  };

  const handleRemoveAssignee = (userId: string) => {
    if (!activeTicket) return;
    const newAssigneeIds = currentAssigneeIds.filter(id => id !== userId);
    const updatedProfiles = (profiles || []).filter(p => newAssigneeIds.includes(p.id));
    updateTicket({
      id: activeTicket.id,
      workspace_id: activeTicket.workspace_id,
      assignee_ids: newAssigneeIds,
    });
    const updated = {
      ...activeTicket,
      assignee_ids: newAssigneeIds,
      assignees: updatedProfiles,
      assignee_id: newAssigneeIds[0] || null,
      assignee: updatedProfiles[0] || null
    };
    setSelectedTicket(updated);
    setDisplayedTicket(updated);
  };

  const hasDescriptionChanged = descriptionText !== (activeTicket.description || '');

  return (
    <div 
      className={`absolute inset-0 z-30 bg-bg-surface flex flex-col overflow-hidden transform transition-transform duration-200 ease-out font-sans ${isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}`}
    >
      {/* Header */}
      <div className="px-3 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between shrink-0 bg-bg-surface">
        <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0 mr-2 sm:mr-4">
          <button
            onClick={handleClose}
            className="flex items-center space-x-1.5 px-2.5 py-1 -ml-1 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors shrink-0"
            title="Back to list (Esc)"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-xs font-medium">Back</span>
          </button>

          <div className="w-px h-4 bg-border shrink-0" />

          <span className="font-id text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-bg-surface-raised border border-transparent text-text-secondary shrink-0">
            {formatTicketIdentifier(activeTicket, currentWorkspace)}
          </span>

            {isEditingTitle ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveTitle(titleText);
                }}
                className="flex-1 min-w-0"
              >
                <input
                  type="text"
                  autoFocus
                  value={titleText}
                  onChange={(e) => setTitleText(e.target.value)}
                  onBlur={() => handleSaveTitle(titleText)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setTitleText(activeTicket.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  className="w-full text-sm sm:text-base font-semibold text-text-primary px-2.5 py-1 bg-bg-surface-raised border border-transparent focus:border-text-secondary focus:ring-1 focus:ring-text-secondary rounded-sm focus:outline-none transition-colors"
                  placeholder="Ticket title..."
                />
              </form>
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="group/title flex items-center space-x-2 cursor-pointer py-1 px-1.5 -ml-1.5 rounded-sm hover:bg-bg-surface/70 transition-colors flex-1 min-w-0"
                title="Click to rename title"
              >
                <h2 className="text-sm sm:text-base font-semibold text-text-primary truncate">
                  {activeTicket.title}
                </h2>
                <Edit3 className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2">
            {(userRole === 'admin' || activeTicket.reporter_id === currentUser?.id) && (
              <button
                onClick={() => setShowDeleteTicketModal(true)}
                className="p-1.5 rounded-full text-text-secondary hover:text-status-error hover:bg-bg-surface transition-colors"
                title="Delete Ticket"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-border min-h-0 overflow-y-auto lg:overflow-hidden">
          {/* Left Column: Description & Comments (Expanded) */}
          <div className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 space-y-6 overflow-y-auto no-scrollbar scrollbar-none">
            {/* Description Section - Full Length */}
            <div className="space-y-3 min-h-[220px] lg:min-h-[calc(100vh-220px)] flex flex-col">
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                Description
              </h3>
              <div className="space-y-2 flex-1 flex flex-col">
                <RichTextEditor
                  content={descriptionText}
                  onChange={setDescriptionText}
                  placeholder="Add description... Formatting and image uploads supported."
                  minHeight="180px"
                />
                {hasDescriptionChanged && (
                  <div className="flex justify-end space-x-2 pt-1">
                    <button
                      onClick={() => setDescriptionText(activeTicket.description || '')}
                      className="px-3 py-1.5 rounded-full text-xs text-text-secondary hover:bg-bg-surface transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDescription}
                      className="px-3 py-1.5 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors"
                    >
                      Save Description
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Comments Thread (Scrolled Section with Heading) */}
            <div className="space-y-4 pt-6 border-t border-border">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center space-x-2 text-sm font-semibold text-text-primary">
                  <MessageSquare className="w-4 h-4 text-accent-primary" />
                  <span>Discussion ({ticketComments.length})</span>
                </div>
                <span className="text-[11px] text-text-tertiary">
                  {ticketComments.length === 0 ? 'No comments yet' : `${ticketComments.length} comment${ticketComments.length > 1 ? 's' : ''}`}
                </span>
              </div>

              <div className="space-y-4">
                {ticketComments.map((comment: any) => {
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
                      className={`group/comment p-4 rounded-md border space-y-2 transition-colors relative ${
                        isMentioned && !isEditing
                          ? 'bg-status-warning/20 border-status-warning/40' 
                          : 'bg-bg-surface border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <img
                            src={comment.author?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author?.full_name)}&background=282828&color=B3B3B3&rounded=true`}
                            alt="Author"
                            className="w-5 h-5 rounded-full object-cover"
                          />
                          <span className="text-xs font-medium text-text-primary">
                            {comment.author?.full_name || 'User'}
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
                                <Edit3 className="w-3 h-3" />
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
                          <span className="text-[11px] text-text-tertiary">
                            {formatRelativeTime(comment.created_at)}
                            {comment.updated_at !== comment.created_at && ' (edited)'}
                          </span>
                        </div>
                      </div>
                      {isEditing ? (
                        <div className="pt-2 pl-7 relative">
                          {showMentionPicker && mentionContext === 'edit' && filteredMentionables.length > 0 && (
                            <div className="absolute bottom-full left-7 mb-1 w-64 max-h-48 overflow-y-auto bg-bg-surface-raised border border-transparent rounded-md shadow-lg z-50 py-1">
                              {filteredMentionables.map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => insertEditMention(p)}
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
                            ref={editTextareaRef}
                            value={editCommentText}
                            onChange={handleEditCommentChange}
                            onKeyDown={(e) => {
                              if (showMentionPicker && mentionContext === 'edit') {
                                if (e.key === 'Escape') {
                                  setShowMentionPicker(false);
                                  setMentionContext(null);
                                  e.preventDefault();
                                }
                              } else {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  if (editCommentText.trim() && editCommentText !== comment.body) {
                                    updateComment({ id: comment.id, body: editCommentText.trim() });
                                  }
                                  setEditingCommentId(null);
                                }
                              }
                            }}
                            onPaste={handleEditCommentPaste}
                            className="w-full text-sm bg-bg-base border border-transparent rounded-md px-3 py-2 text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                            rows={3}
                          />
                          <div className="flex justify-end space-x-2 mt-2">
                            <button
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditCommentText('');
                              }}
                              className="px-3 py-1.5 rounded-full text-xs text-text-secondary hover:bg-bg-surface transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                if (editCommentText.trim() && editCommentText !== comment.body) {
                                  updateComment({ id: comment.id, body: editCommentText.trim() });
                                }
                                setEditingCommentId(null);
                              }}
                              className="px-3 py-1.5 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-text-secondary whitespace-pre-wrap pl-7">
                          {renderCommentBody(comment.body)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Comment Input */}
              <form onSubmit={handleSendComment} className="flex items-start space-x-3 pt-2">
                <img
                  src={currentUser?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.full_name || 'User')}&background=282828&color=B3B3B3&rounded=true`}
                  alt="You"
                  className="w-6 h-6 rounded-full object-cover mt-1"
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
                    placeholder="Leave a comment... (Type @ to mention, Enter to submit)"
                    value={newCommentText}
                    onChange={handleCommentChange}
                    onKeyDown={handleCommentKeyDown}
                    onPaste={handleCommentPaste}
                    className="w-full text-sm bg-bg-surface-raised border border-transparent rounded-md pl-3 pr-10 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                  />
                  <button
                    type="submit"
                    disabled={!newCommentText.trim()}
                    className="absolute right-2 bottom-2 p-1.5 rounded-md text-text-secondary hover:text-accent-primary disabled:opacity-50 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Sidebar Column: Metadata & Multi-Assignees */}
          <div className="w-full lg:w-80 shrink-0 p-4 sm:p-6 space-y-5 bg-bg-surface overflow-y-auto no-scrollbar scrollbar-none">
            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Status
              </label>
              <CustomSelect
                value={activeTicket.state_id || ''}
                onChange={val => handleUpdateField('state_id', val)}
                options={teamStates.map(state => ({ value: state.id, label: state.name }))}
                size="sm"
                className="w-full"
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Type
              </label>
              <CustomSelect
                value={activeTicket.type_id || ''}
                onChange={val => handleUpdateField('type_id', val)}
                options={(ticketTypes || []).map(tt => ({ value: tt.id, label: tt.name }))}
                size="sm"
                className="w-full"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Priority
              </label>
              <CustomSelect
                value={activeTicket.priority || 'none'}
                onChange={val => handleUpdateField('priority', val)}
                options={[
                  { value: 'urgent', label: 'Urgent' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                  { value: 'none', label: 'None' },
                ]}
                size="sm"
                className="w-full"
              />
            </div>

            {/* Sprint */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Sprint
              </label>
              <SprintPicker
                teamId={activeTicket.team_id}
                value={activeTicket.sprint_id ?? null}
                current={activeTicket.sprint}
                onChange={handleSetSprint}
              />
            </div>

            {/* Multi-Assignees Section */}
            <div className="space-y-2 relative" ref={assigneePickerRef}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-text-secondary">
                  Assignees ({currentAssigneeIds.length})
                </label>
                <button
                  type="button"
                  onClick={() => setIsAssigneePickerOpen(!isAssigneePickerOpen)}
                  className="text-xs text-accent-primary hover:underline flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Assign</span>
                </button>
              </div>

              {/* Assigned List Chips */}
              <div className="space-y-1.5">
                {assignedProfiles.length === 0 ? (
                  <div className="text-xs text-text-tertiary p-2 bg-bg-surface-raised border border-transparent rounded-sm">
                    No assignees
                  </div>
                ) : (
                  assignedProfiles.map(u => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-2.5 py-1.5 bg-bg-surface-raised border border-transparent rounded-sm text-xs"
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <img
                          src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || u.email)}&background=282828&color=B3B3B3&rounded=true`}
                          alt="Avatar"
                          className="w-4 h-4 rounded-full object-cover shrink-0"
                        />
                        <span className="text-text-primary truncate font-medium">{u.full_name || u.email}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveAssignee(u.id)}
                        className="text-text-secondary hover:text-status-error p-0.5"
                        title="Unassign"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Assignee Picker Dropdown */}
              {isAssigneePickerOpen && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-bg-surface-raised border border-transparent rounded-md shadow-lg max-h-48 overflow-y-auto p-1.5 space-y-0.5">
                  {mentionableProfiles.map((u: any) => {
                    const isSelected = currentAssigneeIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => handleToggleAssignee(u.id)}
                        className="flex items-center justify-between px-2.5 py-2 hover:bg-bg-surface-hover cursor-pointer rounded-sm text-xs transition-colors"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <img
                            src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || u.email)}&background=282828&color=B3B3B3&rounded=true`}
                            alt="Avatar"
                            className="w-4 h-4 rounded-full object-cover shrink-0"
                          />
                          <div className="truncate">
                            <div className="font-medium text-text-primary truncate">{u.full_name || 'User'}</div>
                            <div className="text-[10px] text-text-secondary truncate">{u.email}</div>
                          </div>
                        </div>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-accent-primary border-accent-primary text-button-text' : 'border-border'}`}>
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-text-secondary">
                  Due Date
                </label>
                {activeTicket.due_date && (
                  <button
                    type="button"
                    onClick={() => handleUpdateField('due_date', null)}
                    className="text-[10px] text-text-tertiary hover:text-status-error transition-colors"
                    title="Clear due date"
                  >
                    Clear
                  </button>
                )}
              </div>
              <DatePicker value={activeTicket.due_date || ''} onChange={(v) => handleUpdateField('due_date', v || null)} placeholder="Due date" />
              {activeTicket.due_date && (() => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const due = new Date(activeTicket.due_date);
                due.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const isCompleted = activeTicket.status?.category === 'completed' || activeTicket.status?.category === 'canceled';

                if (isCompleted) return null;

                if (diffDays < 0) {
                  return (
                    <div className="inline-flex items-center space-x-1 text-[10px] font-medium text-status-error bg-bg-surface-raised border border-transparent px-1.5 py-0.5 rounded-full mt-1">
                      <AlertTriangle className="w-3 h-3 text-status-error shrink-0" />
                      <span>Overdue {Math.abs(diffDays)}d</span>
                    </div>
                  );
                }
                if (diffDays === 0) {
                  return (
                    <div className="inline-flex items-center space-x-1 text-[10px] font-medium text-status-warning bg-bg-surface-raised border border-transparent px-1.5 py-0.5 rounded-full mt-1">
                      <Clock className="w-3 h-3 text-status-warning shrink-0" />
                      <span>Due Today</span>
                    </div>
                  );
                }
                if (diffDays <= 2) {
                  return (
                    <div className="inline-flex items-center space-x-1 text-[10px] font-medium text-status-warning bg-bg-surface-raised border border-transparent px-1.5 py-0.5 rounded-full mt-1">
                      <span>{diffDays}d left</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Timestamps */}
            <div className="pt-4 border-t border-border space-y-2 text-xs text-text-secondary">
              <div className="flex justify-between">
                <span>Created</span>
                <span className="font-medium text-text-primary">
                  {new Date(activeTicket.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Reporter</span>
                <span className="font-medium text-text-primary">
                  {(activeTicket.reporter?.full_name || activeTicket.reporter?.email) ||
                    (activeTicket.reporter_id ? profiles?.find(p => p.id === activeTicket.reporter_id)?.full_name || profiles?.find(p => p.id === activeTicket.reporter_id)?.email : null) ||
                    'System'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Ticket In-App Confirmation Modal */}
        <ConfirmModal
          isOpen={showDeleteTicketModal}
          title="Move Ticket to Trash"
          message={`Move "${activeTicket.title}" to the trash? It leaves every ticket list, and a workspace admin can restore it from the Trash tab or delete it for good.`}
          confirmText="Move to Trash"
          variant="danger"
          onConfirm={() => {
            deleteTicket({ id: activeTicket.id, workspace_id: activeTicket.workspace_id });
            setShowDeleteTicketModal(false);
            handleClose();
          }}
          onCancel={() => setShowDeleteTicketModal(false)}
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
