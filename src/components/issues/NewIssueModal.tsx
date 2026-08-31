import React, { useState } from 'react';
import { X, AlertCircle, Users, Check, Plus } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { useApp } from '../../context/AppContext';
import { IssuePriority } from '../../types/database';
import { useIssues } from '../../hooks/useIssues';
import { useTeams } from '../../hooks/useTeams';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import { useProjects } from '../../hooks/useProjects';
import { useProfiles } from '../../hooks/useProfiles';
import { useWorkflowStates } from '../../hooks/useWorkflowStates';
import { RichTextEditor } from '../common/RichTextEditor';

export const NewIssueModal: React.FC = () => {
  const {
    isNewIssueModalOpen,
    setIsNewIssueModalOpen,
    currentWorkspace,
    currentUser,
    userRole
  } = useApp();

  const { profiles } = useProfiles();
  const { createIssue } = useIssues({ workspaceId: currentWorkspace?.id });
  const { teams } = useTeams(currentWorkspace?.id);
  const { getUserTeams } = useTeamMembers(currentWorkspace?.id);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>(
    currentUser?.id ? [currentUser.id] : []
  );
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAdmin = userRole === 'admin' || currentWorkspace?.created_by === currentUser?.id;
  const userAssignedTeams = currentUser ? getUserTeams(currentUser.id) : [];
  const selectableTeams = isAdmin
    ? (teams || [])
    : (userAssignedTeams.length > 0 ? userAssignedTeams : (teams || []));
  
  const { projects } = useProjects(teamId || undefined);
  const { workflowStates } = useWorkflowStates(teamId || undefined);

  // Set default team if none selected
  React.useEffect(() => {
    if (selectableTeams && selectableTeams.length > 0 && (!teamId || !selectableTeams.some(t => t.id === teamId))) {
      setTeamId(selectableTeams[0].id);
    }
  }, [selectableTeams, teamId]);

  // Set default status
  React.useEffect(() => {
    if (workflowStates && workflowStates.length > 0 && (!statusId || !workflowStates.some(s => s.id === statusId))) {
      const defaultState = workflowStates.find(s => s.is_default) || workflowStates[0];
      if (defaultState) setStatusId(defaultState.id);
    }
  }, [workflowStates, statusId]);

  // Set default current user as assignee once loaded
  React.useEffect(() => {
    if (currentUser?.id && selectedAssigneeIds.length === 0) {
      setSelectedAssigneeIds([currentUser.id]);
    }
  }, [currentUser?.id]);

  const [isOpen, setIsOpen] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  React.useEffect(() => {
    if (isNewIssueModalOpen) {
      setIsRendered(true);
      const raf = requestAnimationFrame(() => {
        setIsOpen(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsOpen(false);
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [isNewIssueModalOpen]);

  const handleClose = React.useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      setIsNewIssueModalOpen(false);
    }, 220);
  }, [setIsNewIssueModalOpen]);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isNewIssueModalOpen || isOpen)) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewIssueModalOpen, isOpen, handleClose]);

  if (!isRendered && !isNewIssueModalOpen) return null;

  const toggleAssignee = (userId: string) => {
    if (selectedAssigneeIds.includes(userId)) {
      setSelectedAssigneeIds(selectedAssigneeIds.filter(id => id !== userId));
    } else {
      setSelectedAssigneeIds([...selectedAssigneeIds, userId]);
    }
  };

  const removeAssignee = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAssigneeIds(selectedAssigneeIds.filter(id => id !== userId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !currentWorkspace?.id) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    createIssue(
      {
        workspace_id: currentWorkspace.id,
        title: title.trim(),
        description: description.trim(),
        team_id: teamId || (selectableTeams[0]?.id || undefined),
        project_id: projectId || null,
        state_id: statusId || (workflowStates && workflowStates[0]?.id) || undefined,
        priority,
        assignee_ids: selectedAssigneeIds,
        reporter_id: currentUser?.id,
        due_date: dueDate || null,
      },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setDueDate('');
          setSelectedAssigneeIds(currentUser?.id ? [currentUser.id] : []);
          setErrorMessage(null);
          setIsSubmitting(false);
          handleClose();
        },
        onError: (err: any) => {
          console.error('Failed to create issue:', err);
          setErrorMessage(err?.message || 'Failed to create issue. Please check your inputs.');
          setIsSubmitting(false);
        }
      }
    );
  };

  const selectedProfiles = (profiles || []).filter(p => selectedAssigneeIds.includes(p.id));

  return (
    <div 
      className={`fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-[1px] transition-opacity duration-200 ease-out font-sans ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className={`w-screen max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-bg-surface border-l border-border shadow-2xl flex flex-col h-full overflow-hidden transform transition-transform duration-200 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-bg-surface">
            <h2 className="text-sm font-semibold text-text-primary">
              Create New Issue
            </h2>
            <button
              onClick={handleClose}
              className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-bg-surface overflow-y-auto no-scrollbar scrollbar-none flex-1 flex flex-col justify-between">
            <div className="space-y-4">
          {errorMessage && (
            <div className="p-2.5 bg-status-error/10 border border-status-error/30 rounded text-xs text-status-error flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              placeholder="Issue title..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full text-xs bg-bg-surface border border-border rounded px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Description
            </label>
            <RichTextEditor
              content={description}
              onChange={setDescription}
              placeholder="Add description... Formatting and image uploads supported."
              minHeight="200px"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-0.5">
                Team
              </label>
              <CustomSelect
                value={teamId}
                onChange={setTeamId}
                options={selectableTeams.length === 0 ? [{ value: '', label: 'Default (Auto)' }] : selectableTeams.map(t => ({ value: t.id, label: `${t.name} (${t.key})` }))}
                size="sm"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-0.5">
                Status
              </label>
              <CustomSelect
                value={statusId}
                onChange={setStatusId}
                options={(workflowStates && workflowStates.length > 0) ? workflowStates.map(s => ({ value: s.id, label: s.name })) : [{ value: '', label: 'Todo (Default)' }]}
                size="sm"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-0.5">
                Project
              </label>
              <CustomSelect
                value={projectId}
                onChange={setProjectId}
                options={[{ value: '', label: 'No Project' }, ...(projects?.map(p => ({ value: p.id, label: p.name })) || [])]}
                size="sm"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-0.5">
                Priority
              </label>
              <CustomSelect
                value={priority}
                onChange={(val) => setPriority(val as IssuePriority)}
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

            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-0.5">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-border-strong h-[30px]"
              />
            </div>
          </div>

          {/* Multiple Assignees Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-medium text-text-secondary">
                Assignees ({selectedAssigneeIds.length})
              </label>
              <button
                type="button"
                onClick={() => setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)}
                className="text-[11px] text-accent-primary hover:underline flex items-center space-x-1 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>{isAssigneeDropdownOpen ? 'Close list' : 'Select users'}</span>
              </button>
            </div>

            {/* Selected Assignee Chips */}
            <div className="flex flex-wrap gap-1.5 p-2 bg-bg-surface border border-border rounded min-h-[38px] items-center">
              {selectedProfiles.length === 0 ? (
                <span className="text-xs text-text-tertiary">No assignees selected</span>
              ) : (
                selectedProfiles.map(u => (
                  <span
                    key={u.id}
                    className="inline-flex items-center space-x-1.5 pl-1 pr-2 py-0.5 bg-bg-surface border border-border rounded text-xs text-text-primary"
                  >
                    <img
                      src={u.avatar_url || `https://ui-avatars.com/api/?name=${u.full_name || u.email}&background=EFE8DC&color=3A342C`}
                      alt="Avatar"
                      className="w-4 h-4 rounded-full object-cover"
                    />
                    <span className="max-w-[120px] truncate">{u.full_name || u.email}</span>
                    <button
                      type="button"
                      onClick={(e) => removeAssignee(u.id, e)}
                      className="text-text-secondary hover:text-status-error ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* In-Flow Multi-Select List */}
            {isAssigneeDropdownOpen && (
              <div className="mt-1.5 bg-bg-surface border border-border rounded-md shadow-sm max-h-40 overflow-y-auto p-1 divide-y divide-border">
                {(profiles || []).map((u: any) => {
                  const isSelected = selectedAssigneeIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleAssignee(u.id)}
                      className="flex items-center justify-between p-2 hover:bg-bg-surface/50 cursor-pointer rounded text-xs transition-colors"
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <img
                          src={u.avatar_url || `https://ui-avatars.com/api/?name=${u.full_name || u.email}&background=EFE8DC&color=3A342C`}
                          alt="Avatar"
                          className="w-5 h-5 rounded-full object-cover shrink-0"
                        />
                        <div className="truncate">
                          <div className="font-medium text-text-primary truncate">{u.full_name || 'User'}</div>
                          <div className="text-[10px] text-text-secondary truncate">{u.email}</div>
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-accent-primary border-accent-primary text-bg-base' : 'border-border'}`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

            </div>

            {/* Footer Buttons */}
            <div className="pt-4 mt-6 border-t border-border flex items-center justify-end space-x-2 shrink-0">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleClose}
                className="px-3.5 py-1.5 rounded text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded bg-accent-primary hover:bg-accent-primary-hover text-bg-base text-xs font-medium transition-colors disabled:opacity-50 shadow-sm"
              >
                {isSubmitting ? 'Creating...' : 'Create Issue'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
