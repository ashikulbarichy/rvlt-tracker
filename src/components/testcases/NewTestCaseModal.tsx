import React, { useState } from 'react';
import { X, CheckSquare, ArrowLeft, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTestCases } from '../../hooks/useTestCases';
import { useProjects } from '../../hooks/useProjects';
import { CustomSelect } from '../common/CustomSelect';
import { IssuePriority } from '../../types/database';

export const NewTestCaseModal: React.FC = () => {
  const {
    isNewTestCaseModalOpen,
    setIsNewTestCaseModalOpen,
    currentWorkspace,
    currentProject
  } = useApp();

  const { createTestCaseAsync } = useTestCases();
  const { projects } = useProjects({ workspaceId: currentWorkspace?.id });

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(currentProject?.id || '');
  const [preconditions, setPreconditions] = useState('');
  const [steps, setSteps] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isOpen, setIsOpen] = useState(false);

  React.useEffect(() => {
    if (isNewTestCaseModalOpen) {
      if (currentProject?.id) setProjectId(currentProject.id);
      setErrorMessage(null);
      const raf = requestAnimationFrame(() => {
        setIsOpen(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsOpen(false);
    }
  }, [isNewTestCaseModalOpen, currentProject?.id]);

  const handleClose = React.useCallback(() => {
    setIsOpen(false);
    setErrorMessage(null);
    setTimeout(() => {
      setIsNewTestCaseModalOpen(false);
    }, 220);
  }, [setIsNewTestCaseModalOpen]);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isNewTestCaseModalOpen || isOpen)) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewTestCaseModalOpen, isOpen, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await createTestCaseAsync({
        title: title.trim(),
        project_id: projectId || undefined,
        preconditions: preconditions.trim(),
        steps: steps.trim(),
        expected_result: expectedResult.trim(),
        status: 'untested',
        priority
      });

      setTitle('');
      setPreconditions('');
      setSteps('');
      setExpectedResult('');
      handleClose();
    } catch (err: any) {
      console.error('Failed to create test case:', err);
      setErrorMessage(err?.message || 'Failed to save test case. Please check your inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const projectOptions = [
    { value: '', label: 'No Project (General)' },
    ...(projects || []).map((p: any) => ({ value: p.id, label: p.name }))
  ];

  return (
    <div 
      className={`absolute inset-0 z-30 bg-bg-surface flex flex-col overflow-hidden transform transition-transform duration-200 ease-out font-sans ${isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}`}
    >
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 flex items-center justify-between shrink-0 bg-bg-surface">
        <div className="flex items-center space-x-3 flex-1 min-w-0 mr-4">
          <button
            onClick={handleClose}
            className="flex items-center space-x-1.5 px-2.5 py-1 -ml-1 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors shrink-0"
            title="Back to test cases (Esc)"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-medium">Test Cases</span>
          </button>

          <div className="w-px h-4 bg-border shrink-0" />

          <div className="flex items-center space-x-2 min-w-0">
            <CheckSquare className="w-4 h-4 text-accent-primary shrink-0" />
            <h2 className="text-sm font-semibold text-text-primary truncate">
              New QA Test Case
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Form Body: 2 Columns */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-border min-h-0 no-scrollbar scrollbar-none">
        {/* Left Column: Form Fields */}
        <div className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 overflow-y-auto no-scrollbar scrollbar-none">
          {errorMessage && (
            <div className="p-3 bg-status-error/10 border border-transparent rounded-sm flex items-center space-x-2.5 text-xs text-status-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
              Test Case Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Verify RLS rejection on cross-tenant request"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full text-sm font-semibold bg-bg-surface-raised border border-transparent rounded-sm px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
              Preconditions
            </label>
            <input
              type="text"
              placeholder="e.g. User is logged in as Member of Workspace A"
              value={preconditions}
              onChange={e => setPreconditions(e.target.value)}
              className="w-full text-xs bg-bg-surface-raised border border-transparent rounded-sm px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
              Steps to Execute
            </label>
            <textarea
              rows={8}
              placeholder="1. Open API endpoint&#10;2. Send request with header X&#10;3. Assert response code 403 Forbidden"
              value={steps}
              onChange={e => setSteps(e.target.value)}
              className="w-full text-xs font-mono bg-bg-surface-raised border border-transparent rounded-sm p-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
              Expected Result
            </label>
            <input
              type="text"
              placeholder="e.g. HTTP 403 Forbidden with empty tenant payload"
              value={expectedResult}
              onChange={e => setExpectedResult(e.target.value)}
              className="w-full text-xs bg-bg-surface-raised border border-transparent rounded-sm px-3 py-2 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
            />
          </div>
        </div>

        {/* Right Sidebar Column: Metadata & Submit Action */}
        <div className="w-full lg:w-80 shrink-0 p-4 sm:p-6 space-y-5 bg-bg-surface overflow-y-auto no-scrollbar scrollbar-none flex flex-col justify-between">
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Project
              </label>
              <CustomSelect
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                size="sm"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
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
                ]}
                size="sm"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Initial Status
              </label>
              <div className="text-xs font-medium text-text-secondary px-2.5 py-1.5 bg-bg-surface-raised border border-transparent rounded-full">
                Untested
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-border flex items-center justify-end space-x-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleClose}
              className="px-3.5 py-1.5 rounded-full text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-4 py-1.5 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
            >
              {isSubmitting ? 'Saving...' : 'Save Test Case'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
