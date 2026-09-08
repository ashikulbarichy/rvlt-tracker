import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { DEFAULT_ARCHIVE_AFTER_DAYS } from '../../hooks/useIssues';

export const WorkspaceSettings: React.FC = () => {
  const { currentWorkspace, userRole, currentUser } = useApp();
  const { updateWorkspace, createWorkspace } = useWorkspaces();
  
  const [workspaceName, setWorkspaceName] = useState('');
  const [issuePrefix, setIssuePrefix] = useState('XXX');
  const [testCasePrefix, setTestCasePrefix] = useState('TC');
  const [archiveAfterDays, setArchiveAfterDays] = useState(String(DEFAULT_ARCHIVE_AFTER_DAYS));
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (currentWorkspace) {
      setWorkspaceName(currentWorkspace.name);
      setIssuePrefix(currentWorkspace.issue_prefix || 'XXX');
      setTestCasePrefix(currentWorkspace.test_case_prefix || 'TC');
      setArchiveAfterDays(String(currentWorkspace.archive_after_days ?? DEFAULT_ARCHIVE_AFTER_DAYS));
    }
  }, [currentWorkspace]);

  const isAdmin = userRole === 'admin' || !currentWorkspace || currentWorkspace?.created_by === currentUser?.id;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !workspaceName.trim()) return;
    
    setIsSaving(true);
    setStatusMessage(null);

    const cleanIssuePrefix = (issuePrefix || 'XXX').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanTestCasePrefix = (testCasePrefix || 'TC').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    // The database enforces 1-365 with a check constraint; fail before the round trip.
    const parsedDays = Number.parseInt(archiveAfterDays, 10);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      setIsSaving(false);
      setStatusMessage({ type: 'error', text: 'Auto-archive window must be a whole number of days between 1 and 365.' });
      return;
    }

    if (currentWorkspace) {
      updateWorkspace(
        {
          id: currentWorkspace.id,
          name: workspaceName.trim(),
          issue_prefix: cleanIssuePrefix,
          test_case_prefix: cleanTestCasePrefix,
          archive_after_days: parsedDays,
        },
        {
          onSuccess: () => {
            setStatusMessage({ type: 'success', text: 'Workspace settings updated successfully.' });
            setTimeout(() => setStatusMessage(null), 4000);
          },
          onError: (err: any) => {
            setStatusMessage({ type: 'error', text: err?.message || 'Failed to update workspace.' });
          },
          onSettled: () => setIsSaving(false)
        }
      );
    } else {
      const defaultSlug = workspaceName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
      createWorkspace(
        {
          name: workspaceName.trim(),
          slug: defaultSlug,
          created_by: currentUser?.id
        },
        {
          onSuccess: () => {
            setStatusMessage({ type: 'success', text: 'Workspace created successfully.' });
            setTimeout(() => setStatusMessage(null), 4000);
          },
          onError: (err: any) => {
            setStatusMessage({ type: 'error', text: err?.message || 'Failed to create workspace.' });
          },
          onSettled: () => setIsSaving(false)
        }
      );
    }
  };

  const isFormDirty =
    !!currentWorkspace &&
    (workspaceName !== currentWorkspace.name ||
      issuePrefix !== (currentWorkspace.issue_prefix || 'ISS') ||
      testCasePrefix !== (currentWorkspace.test_case_prefix || 'TC') ||
      archiveAfterDays !== String(currentWorkspace.archive_after_days ?? DEFAULT_ARCHIVE_AFTER_DAYS));

  return (
    <div className="max-w-xl font-sans">
      <div className="mb-4">
        <h2 className="text-sm font-karla font-semibold text-text-primary mb-0.5">Workspace Settings</h2>
        <p className="text-xs text-text-secondary">
          {currentWorkspace ? 'Manage your workspace details and identifier prefixes.' : 'Set up your workspace to get started.'}
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-bg-surface-raised border border-transparent rounded-md p-4 space-y-4 shadow-sm">
        {statusMessage && (
          <div
            className={`p-2.5 rounded-sm text-xs font-medium border ${
              statusMessage.type === 'success'
                ? 'bg-status-success/15 border-status-success text-text-primary'
                : 'bg-status-error/15 border-status-error text-status-error'
            }`}
          >
            {statusMessage.text}
          </div>
        )}
        
        {!isAdmin && currentWorkspace && (
          <div className="bg-status-warning/10 border border-transparent rounded-sm p-3 flex items-start space-x-2.5">
            <div className="text-status-warning shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
            </div>
            <div>
              <h3 className="text-xs font-medium text-text-primary">Admin Access Required</h3>
              <p className="text-[11px] text-text-secondary mt-0.5">You must be a workspace admin to change these settings.</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="workspaceName" className="block text-xs font-medium text-text-primary mb-1">Workspace Name</label>
            <input
              id="workspaceName"
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              disabled={!isAdmin}
              className="w-full px-2.5 py-1.5 text-xs bg-bg-surface-raised border border-transparent rounded-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary disabled:bg-bg-surface/50 disabled:text-text-tertiary disabled:cursor-not-allowed transition-colors"
              placeholder="e.g. Fjord Engineering"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-primary mb-1">Workspace Slug</label>
            <input
              type="text"
              value={currentWorkspace?.slug || (workspaceName ? workspaceName.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'Auto-generated')}
              disabled
              className="w-full px-2.5 py-1.5 text-xs bg-bg-surface/50 border border-transparent rounded-sm text-text-tertiary focus:outline-none cursor-not-allowed"
            />
            <p className="mt-1 text-[11px] text-text-tertiary">Slugs are unique and cannot be changed after creation.</p>
          </div>

          {/* Identifier Prefix Customization */}
          <div className="pt-2 border-t border-border/60">
            <h3 className="text-xs font-semibold text-text-primary mb-2 font-karla">
              Identifier Prefixes
            </h3>
            <p className="text-[11px] text-text-secondary mb-3">
              Customize the prefix used to generate unique human-readable keys for issues and test cases.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-text-primary mb-1">
                  Default Issue Prefix
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={issuePrefix}
                  onChange={(e) => setIssuePrefix(e.target.value.toUpperCase())}
                  disabled={!isAdmin}
                  className="w-full px-2.5 py-1.5 text-xs font-mono uppercase bg-bg-surface-raised border border-transparent rounded-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                  placeholder="e.g. ISS or DEV"
                />
                <div className="mt-1.5 flex items-center space-x-1.5 text-[10px] text-text-secondary">
                  <span>Preview:</span>
                  <span className="font-mono font-semibold px-1.5 py-0.5 rounded-full bg-bg-surface-raised border border-transparent text-text-primary">
                    {(issuePrefix || 'XXX').toUpperCase()}-DEV-01
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-text-primary mb-1">
                  Test Case Prefix
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={testCasePrefix}
                  onChange={(e) => setTestCasePrefix(e.target.value.toUpperCase())}
                  disabled={!isAdmin}
                  className="w-full px-2.5 py-1.5 text-xs font-mono uppercase bg-bg-surface-raised border border-transparent rounded-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                  placeholder="e.g. TC or TEST"
                />
                <div className="mt-1.5 flex items-center space-x-1.5 text-[10px] text-text-secondary">
                  <span>Preview:</span>
                  <span className="font-mono font-semibold px-1.5 py-0.5 rounded-full bg-bg-surface-raised border border-transparent text-text-primary">
                    {(issuePrefix || 'XXX').toUpperCase()}-{(testCasePrefix || 'TC').toUpperCase()}-01
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-border">
          <label className="block text-[11px] font-medium text-text-primary mb-1">
            Auto-archive closed issues after
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min={1}
              max={365}
              step={1}
              value={archiveAfterDays}
              onChange={(e) => setArchiveAfterDays(e.target.value)}
              disabled={!isAdmin}
              className="w-20 px-2.5 py-1.5 text-xs font-mono bg-bg-surface-raised border border-transparent rounded-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary disabled:opacity-60"
            />
            <span className="text-xs text-text-secondary">days</span>
          </div>
          <p className="mt-1.5 text-[10px] text-text-secondary">
            {isAdmin
              ? 'Issues in a completed or canceled state drop out of the default list after this long. Nothing is deleted — they stay under the Archived tab and can be unarchived at any time.'
              : 'Only workspace admins can change the auto-archive window.'}
          </p>
        </div>

        <div className="pt-3 border-t border-border flex justify-end">
          <button
            type="submit"
            disabled={!isAdmin || isSaving || !workspaceName.trim() || (!!currentWorkspace && !isFormDirty)}
            className="px-3 py-1.5 text-xs font-semibold text-button-text bg-accent-primary rounded-full hover:bg-accent-primary-hover focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : currentWorkspace ? 'Save changes' : 'Create Workspace'}
          </button>
        </div>
      </form>
    </div>
  );
};
