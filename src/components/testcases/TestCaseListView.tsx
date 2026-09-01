import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  HelpCircle,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  Filter,
  Check,
  AlertTriangle,
  ChevronsUp,
  Equal,
  ChevronDown,
  Minus,
  FolderKanban
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TestCase, TestCaseStatus, IssuePriority } from '../../types/database';
import { useTestCases } from '../../hooks/useTestCases';
import { useProjects } from '../../hooks/useProjects';
import { useIssues } from '../../hooks/useIssues';
import { formatTestCaseIdentifier } from '../../lib/identifier';
import { formatRelativeTime } from '../../lib/time';
import { ConfirmModal } from '../common/ConfirmModal';

type ViewMode = 'list' | 'grid';
type SortBy = 'newest' | 'oldest' | 'priority' | 'status' | 'title';

export const TestCaseListView: React.FC = () => {
  const {
    currentWorkspace,
    currentProject,
    setIsNewTestCaseModalOpen,
    userRole,
    currentUser
  } = useApp();

  const { testCases, updateTestCaseAsync, updateTestCaseStatusAsync, deleteTestCaseAsync, isLoading } = useTestCases();
  const { projects } = useProjects({ workspaceId: currentWorkspace?.id });
  const { createIssue } = useIssues({ workspaceId: currentWorkspace?.id });

  const [activeTab, setActiveTab] = useState<'All' | 'Untested' | 'Passed' | 'Failed' | 'Draft'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dropdown states
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);

  const sortMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setIsSortMenuOpen(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setIsViewMenuOpen(false);
      }
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setIsProjectMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const priorityWeights: Record<string, number> = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
    none: 0,
  };

  const statusWeights: Record<TestCaseStatus, number> = {
    failed: 4,
    untested: 3,
    draft: 2,
    passed: 1,
  };

  const filteredTests = useMemo(() => {
    return (testCases || [])
      .filter(tc => {
        if (currentProject && tc.project_id !== currentProject.id) return false;
        if (selectedProjectId !== 'all' && tc.project_id !== selectedProjectId) return false;
        
        if (activeTab === 'Untested' && tc.status !== 'untested') return false;
        if (activeTab === 'Passed' && tc.status !== 'passed') return false;
        if (activeTab === 'Failed' && tc.status !== 'failed') return false;
        if (activeTab === 'Draft' && tc.status !== 'draft') return false;

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
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortBy === 'priority') {
          const wA = priorityWeights[a.priority || 'medium'] || 0;
          const wB = priorityWeights[b.priority || 'medium'] || 0;
          return wB - wA;
        }
        if (sortBy === 'status') {
          const sA = statusWeights[a.status] || 0;
          const sB = statusWeights[b.status] || 0;
          return sB - sA;
        }
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title);
        }
        return 0;
      });
  }, [testCases, currentProject, selectedProjectId, activeTab, searchQuery, sortBy]);

  const availableTabs: ('All' | 'Untested' | 'Passed' | 'Failed' | 'Draft')[] = [
    'All',
    'Untested',
    'Passed',
    'Failed',
    'Draft'
  ];

  const sortOptions = [
    { id: 'newest', label: 'Newest first' },
    { id: 'oldest', label: 'Oldest first' },
    { id: 'priority', label: 'Priority (High → Low)' },
    { id: 'status', label: 'Status' },
    { id: 'title', label: 'Title (A → Z)' },
  ];

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
      description: `### Failed Test Case Reference\n**Preconditions:**\n${test.preconditions || 'None'}\n\n**Reproduction Steps:**\n${test.steps || 'N/A'}\n\n**Expected Result:**\n${test.expected_result || 'N/A'}\n\n**Observed:** Test marked as Failed in QA execution suite.`,
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

  const getPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return <AlertTriangle className="w-3.5 h-3.5 text-status-error shrink-0 fill-status-error" />;
      case 'high':
        return <ChevronsUp className="w-3.5 h-3.5 text-status-warning shrink-0" />;
      case 'medium':
        return <Equal className="w-3.5 h-3.5 text-status-attention shrink-0" />;
      case 'low':
        return <ChevronDown className="w-3.5 h-3.5 text-status-info shrink-0" />;
      default:
        return <Minus className="w-3.5 h-3.5 text-text-tertiary shrink-0" />;
    }
  };

  const selectedProjectObj = projects?.find(p => p.id === selectedProjectId);

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden px-3 sm:px-6 py-3 sm:py-4 font-sans">
      
      {/* Header section */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-karla font-semibold text-text-primary mb-0.5 sm:mb-1">
            Testing
          </h1>
          <p className="hidden sm:block text-text-secondary text-xs sm:text-sm">
            Track, author, and execute quality assurance test suites.
          </p>
        </div>
        <button
          onClick={() => setIsNewTestCaseModalOpen(true)}
          className="flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-md bg-accent-primary hover:bg-accent-primary-hover text-bg-base text-xs sm:text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Test Case</span>
        </button>
      </div>

      {/* Toolbar: Tabs, Left Icon Buttons (Sort, View Mode), Project Filter & Search */}
      <div className="flex flex-wrap items-center justify-between mb-3.5 shrink-0 gap-2.5 sm:gap-3">
        {/* Left Side: Tabs + Icon Buttons */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="flex items-center space-x-3 sm:space-x-4 overflow-x-auto no-scrollbar scrollbar-none">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs font-medium transition-colors relative py-1 shrink-0 ${
                  activeTab === tab
                    ? 'text-text-primary font-semibold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute -bottom-1.5 left-0 w-full h-[2px] bg-text-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Clean Vertical Divider */}
          <div className="h-4 w-[1px] bg-border shrink-0" />

          {/* Sort & View Mode Buttons */}
          <div className="flex items-center space-x-1">
            {/* Sort Dropdown */}
            <div className="relative" ref={sortMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsSortMenuOpen(!isSortMenuOpen);
                  setIsViewMenuOpen(false);
                }}
                className={`p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover ${
                  isSortMenuOpen ? 'bg-bg-surface text-text-primary' : ''
                }`}
                title={`Sort by: ${sortOptions.find(s => s.id === sortBy)?.label}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>

              {isSortMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-44 bg-bg-surface border border-border rounded-md shadow-xl py-1 z-30 animate-in fade-in-0 zoom-in-95">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                    Sort by
                  </div>
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setSortBy(opt.id as SortBy);
                        setIsSortMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
                    >
                      <span>{opt.label}</span>
                      {sortBy === opt.id && <Check className="w-3.5 h-3.5 text-accent-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="relative" ref={viewMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsViewMenuOpen(!isViewMenuOpen);
                  setIsSortMenuOpen(false);
                }}
                className={`p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover ${
                  isViewMenuOpen ? 'bg-bg-surface text-text-primary' : ''
                }`}
                title="Change display layout"
              >
                {viewMode === 'list' ? (
                  <LayoutList className="w-3.5 h-3.5" />
                ) : (
                  <LayoutGrid className="w-3.5 h-3.5" />
                )}
              </button>

              {isViewMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-36 bg-bg-surface border border-border rounded-md shadow-xl py-1 z-30 animate-in fade-in-0 zoom-in-95">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                    Layout
                  </div>
                  <button
                    onClick={() => {
                      setViewMode('list');
                      setIsViewMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <LayoutList className="w-3.5 h-3.5" />
                      <span>List</span>
                    </div>
                    {viewMode === 'list' && <Check className="w-3.5 h-3.5 text-accent-primary" />}
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('grid');
                      setIsViewMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Grid</span>
                    </div>
                    {viewMode === 'grid' && <Check className="w-3.5 h-3.5 text-accent-primary" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Search & Filter */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-36 sm:w-44 pl-8 pr-2.5 py-1.5 bg-bg-surface hover:bg-bg-surface-hover focus:bg-bg-surface border border-border rounded-md text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-border-strong transition-colors"
            />
          </div>

          {/* Project Filter Button */}
          {projects && projects.length > 0 && (
            <div className="relative" ref={projectMenuRef}>
              <button
                type="button"
                onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
                  selectedProjectId !== 'all'
                    ? 'bg-bg-surface border-border-strong text-text-primary font-medium'
                    : 'bg-bg-surface hover:bg-bg-surface-hover border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                <Filter className="w-3.5 h-3.5 text-text-secondary" />
                <span className="truncate max-w-[100px]">
                  {selectedProjectId === 'all' ? 'Projects' : selectedProjectObj?.name || 'Project'}
                </span>
                <ChevronDown className="w-3 h-3 text-text-tertiary" />
              </button>

              {isProjectMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-bg-surface border border-border rounded-md shadow-xl py-1 z-30 animate-in fade-in-0 zoom-in-95">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                    Filter by Project
                  </div>
                  <button
                    onClick={() => {
                      setSelectedProjectId('all');
                      setIsProjectMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
                  >
                    <span>All Projects</span>
                    {selectedProjectId === 'all' && <Check className="w-3.5 h-3.5 text-accent-primary" />}
                  </button>
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setIsProjectMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
                    >
                      <span className="truncate">{proj.name}</span>
                      {selectedProjectId === proj.id && <Check className="w-3.5 h-3.5 text-accent-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar scrollbar-none">
        {filteredTests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-sm text-text-secondary mb-3">No test cases found.</p>
            {(searchQuery || selectedProjectId !== 'all' || activeTab !== 'All') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedProjectId('all');
                  setActiveTab('All');
                }}
                className="text-xs text-accent-primary hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          /* List / Row View */
          <div className="space-y-1.5">
            {filteredTests.map((test: TestCase, idx: number) => {
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
                    className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-surface-hover transition-colors select-none"
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1 mr-4">
                      {/* Priority Icon */}
                      <span title={`Priority: ${test.priority || 'medium'}`}>
                        {getPriorityIcon(test.priority)}
                      </span>

                      {/* Identifier */}
                      <span className="font-id text-xs text-text-secondary shrink-0 font-medium">
                        {formatTestCaseIdentifier(test, idx, currentWorkspace)}
                      </span>

                      {/* Status Icon */}
                      <span title={`Status: ${test.status}`}>
                        {getStatusIcon(test.status)}
                      </span>

                      {/* Title */}
                      <span className="text-xs font-medium text-text-primary truncate">
                        {test.title}
                      </span>

                      {/* Project Badge */}
                      {project && (
                        <span className="hidden md:inline-flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-bg-surface-raised border border-border text-text-tertiary shrink-0">
                          <FolderKanban className="w-2.5 h-2.5" />
                          <span className="truncate max-w-[120px]">{project.name}</span>
                        </span>
                      )}
                    </div>

                    {/* Actions on Row */}
                    <div className="flex items-center space-x-2 shrink-0" onClick={e => e.stopPropagation()}>
                      {/* Status Dropdown */}
                      <select
                        value={test.status}
                        onChange={async e => {
                          try {
                            await updateTestCaseStatusAsync({ id: test.id, status: e.target.value as TestCaseStatus });
                          } catch (err) {
                            console.error('Failed to change status:', err);
                          }
                        }}
                        className={`text-[11px] font-medium px-2 py-0.5 rounded border focus:outline-none cursor-pointer transition-colors ${
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
                          title="File Bug Issue from this test failure"
                          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-status-error/15 hover:bg-status-error/25 border border-status-error/40 text-[11px] text-status-error font-medium transition-colors"
                        >
                          <Bug className="w-3 h-3" />
                          <span className="hidden sm:inline">File Bug</span>
                        </button>
                      )}

                      <button
                        onClick={() => (isEditing ? handleCancelEdit() : handleStartEdit(test))}
                        className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-colors"
                        title={isEditing ? 'Cancel edit' : 'Edit test case'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setDeletingTestCase({ id: test.id, title: test.title })}
                        className="p-1 rounded text-text-tertiary hover:text-status-error hover:bg-bg-surface transition-colors"
                        title="Delete test case"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content / Form */}
                  {isExpanded && (
                    <div className="px-5 py-4 border-t border-border bg-bg-surface-hover/50 text-xs space-y-4">
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
                              className="px-3 py-1.5 rounded bg-bg-surface hover:bg-bg-surface-hover text-text-secondary border border-border text-xs font-medium transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isSavingEdit || !editTitle.trim()}
                              onClick={() => handleSaveEdit(test.id)}
                              className="flex items-center space-x-1 px-3 py-1.5 rounded bg-accent-primary hover:bg-accent-primary-hover text-bg-base text-xs font-medium transition-colors disabled:opacity-50"
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
            })}
          </div>
        ) : (
          /* Grid / Card View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTests.map((test: TestCase, idx: number) => {
              const project = projects?.find(p => p.id === test.project_id);
              return (
                <div
                  key={test.id}
                  onClick={() => setExpandedId(expandedId === test.id ? null : test.id)}
                  className="bg-bg-surface border border-border hover:border-border-strong rounded-md p-4 flex flex-col justify-between space-y-3 cursor-pointer transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-id text-xs text-text-secondary font-medium">
                          {formatTestCaseIdentifier(test, idx, currentWorkspace)}
                        </span>
                        {getPriorityIcon(test.priority)}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        {getStatusIcon(test.status)}
                        <span className="text-[11px] capitalize text-text-secondary font-medium">{test.status}</span>
                      </div>
                    </div>

                    <h3 className="text-xs font-semibold text-text-primary line-clamp-2">
                      {test.title}
                    </h3>

                    {test.steps && (
                      <p className="text-[11px] text-text-secondary line-clamp-2 font-mono bg-bg-surface-raised p-1.5 rounded border border-border">
                        {test.steps}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border text-[10px] text-text-tertiary">
                    <span>{project ? project.name : 'General'}</span>
                    <span>{formatRelativeTime(test.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
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
