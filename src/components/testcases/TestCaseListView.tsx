import React, { useState, useMemo } from 'react';
import {
  CheckSquare,
  Plus,
  Search,
  Bug,
  Trash2,
  Edit2,
  Save,
  X,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TestCase, TestCaseStatus, IssuePriority } from '../../types/database';
import { useTestCases } from '../../hooks/useTestCases';
import { useProjects } from '../../hooks/useProjects';
import { useIssues } from '../../hooks/useIssues';
import { formatTestCaseIdentifier } from '../../lib/identifier';
import { ConfirmModal } from '../common/ConfirmModal';

export const TestCaseListView: React.FC = () => {
  const {
    currentWorkspace,
    currentProject,
    setIsNewTestCaseModalOpen,
    userRole
  } = useApp();

  const { testCases, updateTestCaseAsync, updateTestCaseStatusAsync, deleteTestCaseAsync } = useTestCases();
  const { projects } = useProjects({ workspaceId: currentWorkspace?.id });
  const { createIssue } = useIssues({ workspaceId: currentWorkspace?.id });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TestCaseStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit Mode state
  const [editingTestCaseId, setEditingTestCaseId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPreconditions, setEditPreconditions] = useState('');
  const [editSteps, setEditSteps] = useState('');
  const [editExpectedResult, setEditExpectedResult] = useState('');
  const [editPriority, setEditPriority] = useState<IssuePriority>('medium');
  const [editProjectId, setEditProjectId] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // In-app Delete Confirmation State
  const [deletingTestCase, setDeletingTestCase] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredTests = useMemo(() => {
    return (testCases || []).filter(tc => {
      if (currentProject && tc.project_id !== currentProject.id) return false;
      if (statusFilter !== 'all' && tc.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          tc.title.toLowerCase().includes(q) ||
          (tc.preconditions && tc.preconditions.toLowerCase().includes(q)) ||
          (tc.steps && tc.steps.toLowerCase().includes(q)) ||
          (tc.expected_result && tc.expected_result.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [testCases, currentProject, statusFilter, searchQuery]);

  const handleStartEdit = (test: TestCase) => {
    setEditingTestCaseId(test.id);
    setEditTitle(test.title);
    setEditPreconditions(test.preconditions || '');
    setEditSteps(test.steps || '');
    setEditExpectedResult(test.expected_result || '');
    setEditPriority(test.priority || 'medium');
    setEditProjectId(test.project_id || '');
    setExpandedId(test.id);
  };

  const handleCancelEdit = () => {
    setEditingTestCaseId(null);
  };

  const handleSaveEdit = async (testId: string) => {
    if (!editTitle.trim()) return;
    setIsSavingEdit(true);
    try {
      await updateTestCaseAsync({
        id: testId,
        title: editTitle.trim(),
        preconditions: editPreconditions.trim(),
        steps: editSteps.trim(),
        expected_result: editExpectedResult.trim(),
        priority: editPriority,
        project_id: editProjectId || (null as any)
      });
      setEditingTestCaseId(null);
    } catch (err) {
      console.error('Failed to update test case:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTestCase) return;
    setIsDeleting(true);
    try {
      await deleteTestCaseAsync(deletingTestCase.id);
      if (expandedId === deletingTestCase.id) setExpandedId(null);
      if (editingTestCaseId === deletingTestCase.id) setEditingTestCaseId(null);
      setDeletingTestCase(null);
    } catch (err) {
      console.error('Failed to delete test case:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFileBugFromTest = (test: TestCase) => {
    if (!currentWorkspace) return;
    createIssue({
      workspace_id: currentWorkspace.id,
      title: `[Bug] QA Failure: ${test.title}`,
      description: `### Failed Test Case Reference\n**Preconditions:**\n${test.preconditions}\n\n**Reproduction Steps:**\n${test.steps}\n\n**Expected Result:**\n${test.expected_result}\n\n**Observed:** Test marked as Failed in QA execution suite.`,
      project_id: test.project_id,
      priority: 'high'
    });
  };

  const getStatusIcon = (status: TestCaseStatus) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-status-error shrink-0" />;
      case 'draft':
        return <HelpCircle className="w-3.5 h-3.5 text-text-tertiary shrink-0" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-status-warning shrink-0" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden font-sans">
      {/* Subheader Toolbar */}
      <div className="px-6 py-3.5 border-b border-border bg-transparent flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <CheckSquare className="w-4 h-4 text-accent-primary shrink-0" />
            <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
              {currentProject ? `${currentProject.name} — Test Suite` : 'QA Test Cases'}
            </span>
          </div>
          <span className="text-[11px] text-text-tertiary font-mono">
            {filteredTests.length} {filteredTests.length === 1 ? 'case' : 'cases'}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Search Input */}
          <div className="relative w-48 lg:w-60">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tests..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-bg-surface border border-border rounded text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-strong"
            />
          </div>

          <button
            onClick={() => setIsNewTestCaseModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-accent-primary hover:bg-accent-primary-hover text-bg-base text-xs font-medium transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Test Case</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-6 py-2 border-b border-border bg-bg-surface/40 flex items-center space-x-2 shrink-0">
        <span className="text-[11px] text-text-tertiary mr-1 font-medium">Status:</span>
        {(['all', 'untested', 'passed', 'failed', 'draft'] as const).map(st => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
              statusFilter === st
                ? 'bg-accent-muted text-accent-primary border border-accent-primary/40'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover border border-transparent'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Test Cases List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar scrollbar-none">
        {filteredTests.length === 0 ? (
          <div className="p-12 text-center">
            <CheckSquare className="w-10 h-10 text-text-tertiary mx-auto mb-3 opacity-60" />
            <h3 className="text-sm font-semibold text-text-primary mb-1">No test cases found</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'No test cases match your search query or filter.'
                : 'Create structured test cases to ensure continuous QA quality and link bugs directly.'}
            </p>
            <button
              onClick={() => setIsNewTestCaseModalOpen(true)}
              className="px-3.5 py-1.5 rounded bg-accent-primary text-bg-base text-xs font-medium hover:bg-accent-primary-hover transition-colors shadow-xs"
            >
              Add test case
            </button>
          </div>
        ) : (
          filteredTests.map((test: TestCase, idx: number) => {
            const isExpanded = expandedId === test.id;
            const isEditing = editingTestCaseId === test.id;
            const project = projects?.find(p => p.id === test.project_id);

            return (
              <div
                key={test.id}
                className={`bg-bg-surface border rounded-md overflow-hidden transition-colors ${
                  isExpanded ? 'border-border-strong bg-bg-surface' : 'border-border hover:border-border-strong'
                }`}
              >
                {/* Header Row */}
                <div
                  onClick={() => {
                    if (!isEditing) setExpandedId(isExpanded ? null : test.id);
                  }}
                  className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-surface-hover transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1 mr-4">
                    <span className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded bg-bg-surface-raised border border-border text-text-secondary shrink-0">
                      {formatTestCaseIdentifier(test, idx, currentWorkspace)}
                    </span>

                    {getStatusIcon(test.status)}

                    <span className="text-xs font-medium text-text-primary truncate">
                      {test.title}
                    </span>

                    {project && (
                      <span className="hidden sm:inline-flex items-center space-x-1 text-[10px] px-1.5 py-0.2 rounded bg-bg-surface-raised border border-border text-text-tertiary shrink-0">
                        <Layers className="w-2.5 h-2.5" />
                        <span>{project.name}</span>
                      </span>
                    )}

                    <span className="text-[10px] font-medium capitalize text-text-tertiary shrink-0">
                      {test.priority}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {/* Quick Status Dropdown */}
                    <select
                      value={test.status}
                      onChange={async e => {
                        try {
                          await updateTestCaseStatusAsync({ id: test.id, status: e.target.value as TestCaseStatus });
                        } catch (err) {
                          console.error('Failed to change status:', err);
                        }
                      }}
                      className={`text-[11px] font-medium px-2 py-1 rounded border focus:outline-none cursor-pointer transition-colors ${
                        test.status === 'passed' ? 'bg-status-success/15 border-status-success/40 text-status-success' :
                        test.status === 'failed' ? 'bg-status-error/15 border-status-error/40 text-status-error font-semibold' :
                        test.status === 'draft' ? 'bg-bg-surface border-border text-text-tertiary' :
                        'bg-status-warning/15 border-status-warning/40 text-status-warning'
                      }`}
                    >
                      <option value="untested" className="bg-bg-surface text-text-primary">Untested</option>
                      <option value="passed" className="bg-bg-surface text-text-primary">Passed</option>
                      <option value="failed" className="bg-bg-surface text-text-primary">Failed</option>
                      <option value="draft" className="bg-bg-surface text-text-primary">Draft</option>
                    </select>

                    {test.status === 'failed' && (
                      <button
                        onClick={() => handleFileBugFromTest(test)}
                        title="File Bug Issue from this failure"
                        className="flex items-center space-x-1 px-2 py-1 rounded bg-status-error/15 hover:bg-status-error/25 border border-status-error/40 text-[11px] text-status-error font-medium transition-colors"
                      >
                        <Bug className="w-3 h-3" />
                        <span>File Bug</span>
                      </button>
                    )}

                    <button
                      onClick={() => (isEditing ? handleCancelEdit() : handleStartEdit(test))}
                      className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-colors"
                      title={isEditing ? 'Cancel Edit' : 'Edit Test Case'}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setDeletingTestCase({ id: test.id, title: test.title })}
                      className="p-1 rounded text-text-tertiary hover:text-status-error hover:bg-bg-surface transition-colors"
                      title="Delete Test Case"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details / Edit Form */}
                {isExpanded && (
                  <div className="px-5 py-4 border-t border-border bg-bg-surface-hover/60 text-xs space-y-4">
                    {isEditing ? (
                      /* Inline Edit Form */
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-text-primary uppercase tracking-wider mb-1.5">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            className="w-full text-xs bg-bg-surface border border-border rounded px-3 py-1.5 text-text-primary focus:outline-none focus:border-border-strong"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                              Project
                            </label>
                            <select
                              value={editProjectId}
                              onChange={e => setEditProjectId(e.target.value)}
                              className="w-full text-xs bg-bg-surface border border-border rounded px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-border-strong"
                            >
                              <option value="">No Project (General)</option>
                              {projects?.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                              Priority
                            </label>
                            <select
                              value={editPriority}
                              onChange={e => setEditPriority(e.target.value as IssuePriority)}
                              className="w-full text-xs bg-bg-surface border border-border rounded px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-border-strong"
                            >
                              <option value="urgent">Urgent</option>
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                            Preconditions
                          </label>
                          <textarea
                            rows={2}
                            value={editPreconditions}
                            onChange={e => setEditPreconditions(e.target.value)}
                            className="w-full text-xs bg-bg-surface border border-border rounded p-2.5 text-text-primary focus:outline-none focus:border-border-strong resize-y"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                            Test Steps
                          </label>
                          <textarea
                            rows={3}
                            value={editSteps}
                            onChange={e => setEditSteps(e.target.value)}
                            className="w-full text-xs font-mono bg-bg-surface border border-border rounded p-2.5 text-text-primary focus:outline-none focus:border-border-strong resize-y"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                            Expected Result
                          </label>
                          <textarea
                            rows={2}
                            value={editExpectedResult}
                            onChange={e => setEditExpectedResult(e.target.value)}
                            className="w-full text-xs bg-bg-surface border border-border rounded p-2.5 text-text-primary focus:outline-none focus:border-border-strong resize-y"
                          />
                        </div>

                        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-border">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="px-3 py-1 rounded bg-bg-surface hover:bg-bg-surface-hover text-text-secondary border border-border text-xs font-medium transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isSavingEdit || !editTitle.trim()}
                            onClick={() => handleSaveEdit(test.id)}
                            className="flex items-center space-x-1 px-3 py-1 rounded bg-accent-primary hover:bg-accent-primary-hover text-bg-base text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Read-Only Details */
                      <div className="space-y-3">
                        {test.preconditions && (
                          <div>
                            <span className="font-semibold text-text-secondary text-[10px] uppercase tracking-wider block mb-0.5">
                              Preconditions:
                            </span>
                            <p className="text-text-primary leading-relaxed whitespace-pre-wrap">{test.preconditions}</p>
                          </div>
                        )}

                        <div>
                          <span className="font-semibold text-text-secondary text-[10px] uppercase tracking-wider block mb-0.5">
                            Test Steps:
                          </span>
                          <p className="text-text-primary whitespace-pre-wrap font-mono text-[11px] bg-bg-surface border border-border rounded p-2.5 leading-relaxed">
                            {test.steps || 'No steps provided.'}
                          </p>
                        </div>

                        <div>
                          <span className="font-semibold text-text-secondary text-[10px] uppercase tracking-wider block mb-0.5">
                            Expected Result:
                          </span>
                          <p className="text-text-primary whitespace-pre-wrap leading-relaxed">
                            {test.expected_result || 'No expected result specified.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      
      {/* Delete Test Case In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingTestCase}
        title="Delete Test Case"
        message={`Are you sure you want to delete test case "${deletingTestCase?.title}"? This action cannot be undone.`}
        confirmText="Delete Test Case"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !isDeleting && setDeletingTestCase(null)}
      />
    </div>
  );
};
