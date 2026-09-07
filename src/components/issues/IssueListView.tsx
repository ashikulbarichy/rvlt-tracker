import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  Columns3,
  Check,
  Calendar,
  Layers,
  AlertTriangle,
  ChevronsUp,
  Equal,
  ChevronDown,
  Minus,
  Filter,
  AlignJustify,
  Clock
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SidebarToggle } from '../../components/layout/SidebarToggle';
import { useIssues } from '../../hooks/useIssues';
import { useTeams } from '../../hooks/useTeams';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import { useWorkflowStates } from '../../hooks/useWorkflowStates';
import { Issue } from '../../types/database';
import { formatIssueIdentifier } from '../../lib/identifier';
import { formatRelativeTime } from '../../lib/time';
import { stripHtml } from '../../utils/htmlUtils';
import { StatusBadge } from '../common/StatusBadge';

interface IssueListViewProps {
  onlyMine?: boolean;
}

type ViewMode = 'list' | 'grid' | 'kanban';
type SortBy = 'newest' | 'oldest' | 'priority' | 'dueDate' | 'title';

type Tab = 'All' | 'Mine' | 'Open' | 'Closed';

// Persisted view preferences so filters/view survive page refreshes
interface ViewPrefs {
  activeTab?: Tab;
  viewMode?: ViewMode;
  isCompact?: boolean;
  sortBy?: SortBy;
  teamIds?: string[];
}

const VIEW_PREFS_KEY = 'rvlt-issue-view-prefs';

const loadViewPrefs = (): ViewPrefs => {
  try {
    return JSON.parse(localStorage.getItem(VIEW_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
};

export const IssueListView: React.FC<IssueListViewProps> = ({ onlyMine = false }) => {
  const { currentWorkspace, currentUser, userRole, setIsNewIssueModalOpen, setSelectedIssue, currentTeam } = useApp();
  const savedPrefs = useRef(loadViewPrefs()).current;
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = savedPrefs.activeTab;
    if (tab && ['All', 'Mine', 'Open', 'Closed'].includes(tab) && !(onlyMine && tab === 'Mine')) return tab;
    return 'All';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(
    () => new Set(Array.isArray(savedPrefs.teamIds) ? savedPrefs.teamIds : [])
  );
  const [page, setPage] = useState(1);
  const limit = 100;

  // View Mode & Sort State
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    savedPrefs.viewMode && ['list', 'grid', 'kanban'].includes(savedPrefs.viewMode) ? savedPrefs.viewMode : 'list'
  );
  const [isCompact, setIsCompact] = useState(() => !!savedPrefs.isCompact);
  const [sortBy, setSortBy] = useState<SortBy>(() =>
    savedPrefs.sortBy && ['newest', 'oldest', 'priority', 'dueDate', 'title'].includes(savedPrefs.sortBy) ? savedPrefs.sortBy : 'newest'
  );
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);

  const sortMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const teamMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setIsSortMenuOpen(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setIsViewMenuOpen(false);
      }
      if (teamMenuRef.current && !teamMenuRef.current.contains(e.target as Node)) {
        setIsTeamMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Persist view preferences across refreshes
  useEffect(() => {
    try {
      const prefs: ViewPrefs = {
        activeTab,
        viewMode,
        isCompact,
        sortBy,
        teamIds: Array.from(selectedTeamIds),
      };
      localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Storage unavailable (private mode etc.) — preferences just won't persist
    }
  }, [activeTab, viewMode, isCompact, sortBy, selectedTeamIds]);

  const isAdmin = userRole === 'admin' || currentWorkspace?.created_by === currentUser?.id;
  const { teams } = useTeams(currentWorkspace?.id);
  const { getUserTeams } = useTeamMembers(currentWorkspace?.id);
  const firstSelectedTeamId = selectedTeamIds.size === 1 ? Array.from(selectedTeamIds)[0] : undefined;
  const { workflowStates } = useWorkflowStates(firstSelectedTeamId);

  const userAssignedTeams = currentUser ? getUserTeams(currentUser.id) : [];
  const visibleTeams = isAdmin
    ? (teams || [])
    : (userAssignedTeams.length > 0 ? userAssignedTeams : (teams || []));

  // Derive filters based on active tab or onlyMine
  let assigneeId;
  if ((onlyMine || activeTab === 'Mine') && currentUser) {
    assigneeId = currentUser.id;
  }

  const { issues, totalCount, isLoading, updateIssue } = useIssues({
    workspaceId: currentWorkspace?.id,
    teamId: firstSelectedTeamId,
    assigneeId,
    page,
    limit,
    searchQuery
  });

  const toggleTeamFilter = (teamId: string) => {
    setSelectedTeamIds(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const getPriorityIconInfo = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return { icon: <AlertTriangle className="w-4 h-4 text-status-error shrink-0 fill-status-error" />, label: 'Urgent' };
      case 'high':
        return { icon: <ChevronsUp className="w-4 h-4 text-status-warning shrink-0" />, label: 'High' };
      case 'medium':
        return { icon: <Equal className="w-4 h-4 text-status-attention shrink-0" />, label: 'Med' };
      case 'low':
        return { icon: <ChevronDown className="w-4 h-4 text-status-info shrink-0" />, label: 'Low' };
      default:
        return { icon: <Minus className="w-4 h-4 text-text-tertiary shrink-0" />, label: 'None' };
    }
  };

  const getRelativeTime = (dateString: string) => {
    return formatRelativeTime(dateString, { prefix: 'Updated' });
  };

  const priorityWeights: Record<string, number> = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
    none: 0,
  };

  // Client side filter for team scoping & Open/Closed
  const filteredIssues = issues.filter(issue => {
    if (onlyMine && currentUser) {
      const isAssigned = issue.assignee_id === currentUser.id ||
        issue.assignee_ids?.includes(currentUser.id) ||
        issue.assignees?.some((a: any) => a.id === currentUser.id);
      if (!isAssigned) return false;
    }

    // Non-admin members can only see issues belonging to their assigned teams
    if (!isAdmin && userAssignedTeams.length > 0) {
      if (!userAssignedTeams.some(t => t.id === issue.team_id)) return false;
    }
    if (!isAdmin && userAssignedTeams.length === 0) {
      return false;
    }

    if (selectedTeamIds.size > 0 && !selectedTeamIds.has(issue.team_id)) return false;
    if (activeTab === 'Open') return issue.status?.category !== 'completed' && issue.status?.category !== 'canceled';
    if (activeTab === 'Closed') return issue.status?.category === 'completed' || issue.status?.category === 'canceled';
    return true;
  }).sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === 'oldest') {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sortBy === 'priority') {
      const wA = priorityWeights[a.priority || 'none'] || 0;
      const wB = priorityWeights[b.priority || 'none'] || 0;
      return wB - wA;
    }
    if (sortBy === 'dueDate') {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });

  const availableTabs = onlyMine
    ? ['All', 'Open', 'Closed']
    : ['All', 'Mine', 'Open', 'Closed'];

  const sortOptions = [
    { id: 'newest', label: 'Newest first' },
    { id: 'oldest', label: 'Oldest first' },
    { id: 'priority', label: 'Priority (High → Low)' },
    { id: 'dueDate', label: 'Due Date (Earliest)' },
    { id: 'title', label: 'Title (A → Z)' },
  ];

  // Derive unique columns for Kanban view (deduplicating states across multiple teams)
  const kanbanColumns = React.useMemo(() => {
    if (workflowStates && workflowStates.length > 0) {
      if (firstSelectedTeamId) {
        return workflowStates.sort((a, b) => a.position - b.position);
      }

      // If viewing across 'all' teams, deduplicate by unique normalized state name
      const seen = new Set<string>();
      const uniqueColumns: typeof workflowStates = [];

      for (const state of workflowStates) {
        const normalized = state.name.trim().toLowerCase();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          uniqueColumns.push(state);
        }
      }
      return uniqueColumns.sort((a, b) => a.position - b.position);
    }

    return [
      { id: 'backlog', name: 'Backlog', category: 'backlog', position: 0 },
      { id: 'todo', name: 'To Do', category: 'unstarted', position: 1 },
      { id: 'in_progress', name: 'In Progress', category: 'started', position: 2 },
      { id: 'in_review', name: 'In Review', category: 'started', position: 3 },
      { id: 'done', name: 'Done', category: 'completed', position: 4 },
      { id: 'canceled', name: 'Canceled', category: 'canceled', position: 5 },
    ];
  }, [workflowStates, firstSelectedTeamId]);

  const renderIssueDueDateBadge = (dueDateStr?: string | null, isCompleted?: boolean) => {
    if (!dueDateStr) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const formatted = due.toLocaleDateString();

    if (isCompleted) {
      return (
        <span className="text-[10px] text-text-tertiary">
          {formatted}
        </span>
      );
    }

    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-status-error bg-status-error/10 border border-transparent px-1.5 py-0.5 rounded-full">
          <AlertTriangle className="w-3 h-3 text-status-error shrink-0" />
          <span>Overdue {Math.abs(diffDays)}d</span>
        </span>
      );
    }

    if (diffDays === 0) {
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-status-warning bg-status-warning/10 border border-transparent px-1.5 py-0.5 rounded-full">
          <Clock className="w-3 h-3 text-status-warning shrink-0" />
          <span>Due Today</span>
        </span>
      );
    }

    if (diffDays <= 2) {
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-status-warning bg-status-warning/10 border border-transparent px-1.5 py-0.5 rounded-full">
          <span>{diffDays}d left</span>
        </span>
      );
    }

    return (
      <span className="text-[10px] text-text-secondary font-mono">
        {formatted}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden px-3 sm:px-6 py-3 sm:py-4 font-sans">
      
      {/* Header section */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl sm:text-2xl font-karla font-bold tracking-tight text-text-primary mb-0.5 sm:mb-1">
            <SidebarToggle />
            {onlyMine ? 'My Issues' : 'Issues'}
          </h1>
          <p className="hidden sm:block text-text-secondary text-xs sm:text-sm">
            {onlyMine
              ? 'Issues assigned to you in this workspace.'
              : 'Track, manage, and resolve project tasks.'}
          </p>
        </div>
        <button
          onClick={() => setIsNewIssueModalOpen(true)}
          className="flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs sm:text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Issue</span>
        </button>
      </div>

      {/* Notice for non-admin members with no assigned teams */}
      {!isAdmin && userAssignedTeams.length === 0 && (
        <div className="mb-3 p-3 bg-status-warning/10 border border-transparent rounded-md flex items-start space-x-2.5">
          <AlertCircle className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">No team assigned:</span> You are currently not assigned to any team in this workspace. You will only be able to view and manage issues once a workspace admin assigns you to a team.
          </div>
        </div>
      )}

      {/* Toolbar: Tabs, Left Icon Buttons (Sort, View Mode), Team Filter & Search */}
      <div className="flex flex-wrap items-center justify-between mb-3.5 shrink-0 gap-2.5 sm:gap-3">
        {/* Left Side: Tabs + 2 Icon Buttons */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="flex items-center space-x-3 sm:space-x-4 overflow-x-auto no-scrollbar scrollbar-none">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
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


          {/* TWO ICON BUTTONS ON THE LEFT: Sort & View Mode */}
          <div className="flex items-center space-x-1">
            {/* 1. Sort Icon Button with Dropdown */}
            <div className="relative" ref={sortMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsSortMenuOpen(!isSortMenuOpen);
                  setIsViewMenuOpen(false);
                }}
                className={`w-7 h-7 rounded-sm text-xs transition-colors flex items-center justify-center ${
                  isSortMenuOpen || sortBy !== 'newest'
                    ? 'bg-bg-surface-hover text-text-primary border border-transparent shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                }`}
                title={`Sort issues (Current: ${sortOptions.find(o => o.id === sortBy)?.label})`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>

              {isSortMenuOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-48 bg-bg-surface-raised border border-transparent rounded-md shadow-lg py-1 z-30 font-sans">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                    Sort By
                  </div>
                  {sortOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setSortBy(opt.id as any);
                        setIsSortMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left transition-colors ${
                        sortBy === opt.id
                          ? 'bg-bg-surface text-text-primary font-medium'
                          : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {sortBy === opt.id && <Check className="w-3 h-3 text-accent-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. View Mode Icon Button with Dropdown */}
            <div className="relative" ref={viewMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsViewMenuOpen(!isViewMenuOpen);
                  setIsSortMenuOpen(false);
                }}
                className={`w-7 h-7 rounded-sm text-xs transition-colors flex items-center justify-center ${
                  isViewMenuOpen
                    ? 'bg-bg-surface-hover text-text-primary border border-transparent shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                }`}
                title={`View Type: ${viewMode}`}
              >
                {viewMode === 'list' && <LayoutList className="w-3.5 h-3.5" />}
                {viewMode === 'grid' && <LayoutGrid className="w-3.5 h-3.5" />}
                {viewMode === 'kanban' && <Columns3 className="w-3.5 h-3.5" />}
              </button>

              {isViewMenuOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-36 bg-bg-surface-raised border border-transparent rounded-md shadow-lg py-1 z-30 font-sans">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                    View As
                  </div>
                  <button
                    onClick={() => {
                      setViewMode('list');
                      setIsViewMenuOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                      viewMode === 'list'
                        ? 'bg-bg-surface text-text-primary font-medium'
                        : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    <span>List</span>
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('grid');
                      setIsViewMenuOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-bg-surface text-text-primary font-medium'
                        : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Grid</span>
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('kanban');
                      setIsViewMenuOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                      viewMode === 'kanban'
                        ? 'bg-bg-surface text-text-primary font-medium'
                        : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <Columns3 className="w-3.5 h-3.5" />
                    <span>Kanban</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. Compact View Toggle */}
            {viewMode === 'list' && (
              <button
                type="button"
                onClick={() => setIsCompact(!isCompact)}
                className={`w-7 h-7 rounded-sm text-xs transition-colors flex items-center justify-center ${
                  isCompact
                    ? 'bg-bg-surface-hover text-text-primary border border-transparent shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                }`}
                title={isCompact ? "Standard view" : "Compact view"}
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        
        {/* Right Side: Team Filter & Search */}
        <div className="flex items-center space-x-2">

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 pl-8 pr-3 py-1 text-xs bg-bg-surface-raised border border-transparent rounded-full text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
            />
          </div>

          {/* Team Filter Button with Checkbox Dropdown */}
          {visibleTeams.length > 0 && (
            <div className="relative" ref={teamMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsTeamMenuOpen(!isTeamMenuOpen);
                  setIsSortMenuOpen(false);
                  setIsViewMenuOpen(false);
                }}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs transition-colors focus:outline-none ${
                  selectedTeamIds.size > 0
                    ? 'bg-bg-surface-hover border border-transparent text-text-primary'
                    : 'bg-bg-surface-raised border border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                }`}
                title="Filter by team"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Teams</span>
                {selectedTeamIds.size > 0 && (
                  <span className="bg-text-primary text-button-text text-[10px] font-semibold w-4 h-4 rounded-full flex items-center justify-center">
                    {selectedTeamIds.size}
                  </span>
                )}
              </button>

              {isTeamMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-bg-surface-raised border border-transparent rounded-md shadow-lg py-1 z-30 font-sans">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                    Filter by Team
                  </div>
                  {/* All Teams option */}
                  <button
                    onClick={() => setSelectedTeamIds(new Set())}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 text-xs text-left transition-colors ${
                      selectedTeamIds.size === 0
                        ? 'text-text-primary font-medium'
                        : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                      selectedTeamIds.size === 0 ? 'bg-text-primary border-text-primary' : 'border-border-strong'
                    }`}>
                      {selectedTeamIds.size === 0 && <Check className="w-2.5 h-2.5 text-button-text" />}
                    </div>
                    <span>All Teams</span>
                  </button>
                  <div className="my-1 h-px bg-border" />
                  {visibleTeams.map(team => (
                    <button
                      key={team.id}
                      onClick={() => toggleTeamFilter(team.id)}
                      className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 text-xs text-left transition-colors ${
                        selectedTeamIds.has(team.id)
                          ? 'text-text-primary font-medium'
                          : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                        selectedTeamIds.has(team.id) ? 'bg-text-primary border-text-primary' : 'border-border-strong'
                      }`}>
                        {selectedTeamIds.has(team.id) && <Check className="w-2.5 h-2.5 text-button-text" />}
                      </div>
                      <span className="truncate">{team.name}</span>
                      <span className="ml-auto text-text-tertiary font-mono text-[10px]">{team.key}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area based on View Mode */}
      {isLoading ? (
        <div className="flex-1 p-12 text-center text-xs text-text-secondary">Loading issues...</div>
      ) : filteredIssues.length === 0 ? (
        <div className="flex-1 p-12 text-center text-xs text-text-secondary">No issues found.</div>
      ) : viewMode === 'list' ? (
        /* --------------------------------------------------------
           1. LIST VIEW (Full-width individual cards on canvas)
           -------------------------------------------------------- */
        <div className={`flex-1 overflow-y-auto pr-1 pb-4 ${isCompact ? 'divide-y divide-border' : 'space-y-2.5'}`}>
          {filteredIssues.map((issue) => {
            const priorityInfo = getPriorityIconInfo(issue.priority);
            const teamKey = issue.team?.key || issue.project?.key || 'ISSUE';

            return (
              <div
                key={issue.id}
                onClick={() => setSelectedIssue(issue)}
                className={`group bg-bg-surface-raised hover:bg-bg-surface-hover transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between ${
                  isCompact ? 'p-2 gap-2' : 'border border-transparent rounded-lg shadow-xs hover:shadow-sm p-3.5 gap-3'
                }`}
              >
                {/* Left Section: Identifier, Priority, Status */}
                <div className="flex items-center min-w-0 flex-1">
                  <div className="flex items-center shrink-0">
                    <div className="w-24 shrink-0 flex items-center justify-start pr-2">
                      <span className="inline-flex items-center justify-center text-center font-id text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-bg-surface-raised border border-transparent transition-colors text-text-secondary">
                        {formatIssueIdentifier(issue, currentWorkspace)}
                      </span>
                    </div>

                    <div className="w-16 shrink-0 flex items-center justify-start pl-3" title={`Priority: ${priorityInfo.label}`}>
                      {priorityInfo.icon}
                    </div>

                    <div className="w-28 shrink-0 flex items-center">
                        <StatusBadge name={issue.status?.name || 'Open'} color={issue.status?.color} />
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-text-primary truncate min-w-0 pl-2">
                    {issue.title}
                  </h3>

                  {issue.description && !isCompact && (
                    <p className="text-xs text-text-secondary truncate hidden lg:inline pl-2 max-w-[200px] xl:max-w-[400px]">
                      {stripHtml(issue.description)}
                    </p>
                  )}
                </div>

                {/* Right Section: Assignees, Due Date, Timestamp */}
                <div className="flex items-center shrink-0 sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                  <div className="w-28 shrink-0 flex justify-end">
                    {renderIssueDueDateBadge(issue.due_date, issue.status?.category === 'completed' || issue.status?.category === 'canceled')}
                  </div>

                  <div className="w-36 shrink-0 flex items-center min-w-0 pl-4">
                    {issue.assignees && issue.assignees.length > 0 ? (
                      <div className="flex items-center space-x-1.5 min-w-0" title={issue.assignees.map((a: any) => a.full_name || a.email).join(', ')}>
                        <div className="flex -space-x-2 overflow-hidden shrink-0">
                          {issue.assignees.slice(0, 3).map((assignee: any, idx: number) => (
                            <img
                              key={assignee.id || idx}
                              src={assignee.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.full_name || assignee.email)}&background=282828&color=B3B3B3&rounded=true`}
                              alt={assignee.full_name || 'Assignee'}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ))}
                        </div>
                        {issue.assignees.length > 3 && (
                          <span className="text-[10px] font-semibold text-text-secondary bg-bg-surface-hover px-1.5 py-0.5 rounded-full">
                            +{issue.assignees.length - 3}
                          </span>
                        )}
                        <span className="text-xs text-text-secondary truncate max-w-[100px]">
                          {issue.assignees.length === 1
                            ? (issue.assignees[0].full_name?.split(' ')[0] || 'User')
                            : `${issue.assignees.length} assignees`}
                        </span>
                      </div>
                    ) : issue.assignee ? (
                      <div className="flex items-center space-x-1.5">
                        <img
                          src={issue.assignee.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(issue.assignee.full_name)}&background=282828&color=B3B3B3&rounded=true`}
                          alt="Assignee"
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                        <span className="text-xs text-text-secondary truncate max-w-[100px]">
                          {issue.assignee.full_name?.split(' ')[0] || 'User'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <div className="w-6 h-6 rounded-full bg-bg-surface-hover flex items-center justify-center text-text-tertiary text-[10px] border border-transparent shrink-0">
                          UN
                        </div>
                        <span className="text-xs text-text-tertiary">Unassigned</span>
                      </div>
                    )}
                  </div>

                  <div className="w-28 shrink-0 flex justify-end pl-4">
                    <span className="text-[11px] text-text-tertiary text-right whitespace-nowrap">
                      {issue.updated_at ? getRelativeTime(issue.updated_at) : 'Just now'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'grid' ? (
        /* --------------------------------------------------------
           2. GRID VIEW (Multi-column responsive issue cards)
           -------------------------------------------------------- */
        <div className="flex-1 overflow-y-auto pr-1 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredIssues.map((issue) => {
              const priorityInfo = getPriorityIconInfo(issue.priority);
              const teamKey = issue.team?.key || issue.project?.key || 'ISSUE';

              return (
                <div
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  className="group p-4 bg-bg-surface-raised hover:bg-bg-surface-hover border border-transparent rounded-lg shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center justify-center text-center font-id text-xs font-semibold px-2 py-0.5 rounded-full bg-bg-surface-raised border border-transparent transition-colors text-text-secondary">
                        {formatIssueIdentifier(issue, currentWorkspace)}
                      </span>

                      <div className="flex items-center space-x-2">
                        <div className="flex items-center" title={`Priority: ${priorityInfo.label}`}>
                          {priorityInfo.icon}
                        </div>
                          <StatusBadge name={issue.status?.name || 'Open'} color={issue.status?.color} size="xs" />
                      </div>
                    </div>

                    <h3 className="text-sm font-semibold text-text-primary line-clamp-2">
                      {issue.title}
                    </h3>

                    {issue.description && (
                      <p className="text-xs text-text-secondary line-clamp-2">
                        {stripHtml(issue.description)}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 flex items-center justify-between text-xs text-text-secondary">
                    {/* Assignees */}
                    <div className="flex items-center space-x-1.5 min-w-0">
                      {issue.assignees && issue.assignees.length > 0 ? (
                        <div className="flex -space-x-2 overflow-hidden">
                          {issue.assignees.slice(0, 3).map((a: any, idx: number) => (
                            <img
                              key={a.id || idx}
                              src={a.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.full_name || a.email)}&background=282828&color=B3B3B3&rounded=true`}
                              alt="Assignee"
                              className="w-5 h-5 rounded-full object-cover"
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-text-tertiary">Unassigned</span>
                      )}
                    </div>

                    {/* Due date or updated */}
                    <div>
                      {renderIssueDueDateBadge(issue.due_date, issue.status?.category === 'completed' || issue.status?.category === 'canceled') || (
                        <span className="text-[10px] text-text-tertiary">
                          {issue.updated_at ? getRelativeTime(issue.updated_at) : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* --------------------------------------------------------
           3. KANBAN BOARD VIEW (Columns grouped by workflow state)
           -------------------------------------------------------- */
        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2">
          <div className="flex space-x-3.5 h-full min-w-max pr-2">
            {kanbanColumns.map((column) => {
              const columnIssues = filteredIssues.filter(issue => {
                if (issue.status_id === column.id) return true;
                if (issue.status?.name && column.name) {
                  if (issue.status.name.trim().toLowerCase() === column.name.trim().toLowerCase()) {
                    return true;
                  }
                }
                if (!issue.status_id && !issue.status && (column.category === 'backlog' || column.name.toLowerCase() === 'backlog')) {
                  return true;
                }
                return false;
              });

              return (
                <div
                  key={column.id}
                  className="w-72 bg-black/20 border border-transparent rounded-lg flex flex-col h-full max-h-full overflow-hidden"
                >
                  {/* Column Header */}
                  <div className="p-3 flex items-center justify-between shrink-0">
                    <div className="flex items-center">
                      <StatusBadge name={column.name} color={(column as any).color} />
                    </div>
                    <span className="min-w-[20px] px-1.5 py-0.5 text-[10px] font-mono bg-black/30 border border-transparent rounded-full text-text-secondary font-medium">
                      {columnIssues.length}
                    </span>
                  </div>

                  {/* Column Cards Container */}
                  <div 
                    className={`flex-1 overflow-y-auto p-2.5 space-y-2.5 transition-colors ${
                      dragOverColumnId === column.id ? 'bg-bg-surface-hover/80' : ''
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragOverColumnId(column.id);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      // Only clear if we're leaving the container itself, not child elements
                      if (e.currentTarget === e.target) {
                        setDragOverColumnId(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverColumnId(null);
                      const issueId = e.dataTransfer.getData('text/plain');
                      if (issueId) {
                        const issueToUpdate = filteredIssues.find(i => i.id === issueId);
                        if (issueToUpdate && issueToUpdate.state_id !== column.id) {
                          updateIssue({
                            id: issueId,
                            workspace_id: issueToUpdate.workspace_id,
                            state_id: column.id
                          });
                        }
                      }
                    }}
                  >
                    {columnIssues.length === 0 ? (
                      <div className="h-24 border border-dashed border-border rounded-sm flex items-center justify-center text-[11px] text-text-tertiary">
                        No issues
                      </div>
                    ) : (
                      columnIssues.map((issue) => {
                        const priorityInfo = getPriorityIconInfo(issue.priority);

                        return (
                          <div
                            key={issue.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', issue.id);
                              e.dataTransfer.effectAllowed = 'move';
                              // Drag ghost: opaque rounded clone, otherwise the browser
                              // snapshot shows sharp corners over the dark background
                              const el = e.currentTarget as HTMLElement;
                              const ghost = el.cloneNode(true) as HTMLElement;
                              ghost.style.width = `${el.offsetWidth}px`;
                              ghost.style.backgroundColor = 'var(--color-bg-surface-hover)';
                              ghost.style.borderRadius = '12px';
                              ghost.style.position = 'fixed';
                              ghost.style.top = '-9999px';
                              ghost.style.left = '-9999px';
                              document.body.appendChild(ghost);
                              e.dataTransfer.setDragImage(ghost, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                              requestAnimationFrame(() => ghost.remove());
                            }}
                            onClick={() => setSelectedIssue(issue)}
                            className="group p-3 bg-bg-surface-raised hover:bg-bg-surface-hover border border-transparent rounded-md shadow-xs hover:shadow-sm transition-all cursor-pointer space-y-2 active:cursor-grabbing"
                          >
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center justify-center text-center font-id text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/30 border border-transparent transition-colors text-text-secondary">
                                {formatIssueIdentifier(issue, currentWorkspace)}
                              </span>

                              <div className="flex items-center" title={`Priority: ${priorityInfo.label}`}>
                                {priorityInfo.icon}
                              </div>
                            </div>

                            <h4 className="text-xs font-semibold text-text-primary line-clamp-2">
                              {issue.title}
                            </h4>

                            <div className="pt-2 flex items-center justify-between text-[10px] text-text-secondary">
                              <div className="flex items-center space-x-1">
                                {issue.assignees && issue.assignees.length > 0 ? (
                                  <div className="flex -space-x-1.5 overflow-hidden">
                                    {issue.assignees.slice(0, 2).map((a: any, idx: number) => (
                                      <img
                                        key={a.id || idx}
                                        src={a.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.full_name || a.email)}&background=282828&color=B3B3B3&rounded=true`}
                                        alt="Assignee"
                                        className="w-4 h-4 rounded-full object-cover"
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-text-tertiary">Unassigned</span>
                                )}
                              </div>

                              {issue.due_date && (
                                <div>
                                  {renderIssueDueDateBadge(issue.due_date, issue.status?.category === 'completed' || issue.status?.category === 'canceled')}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination Footer (for List and Grid views) */}
      {viewMode !== 'kanban' && (
        <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-secondary shrink-0">
          <div>
            {Math.min((page - 1) * limit + 1, totalCount)} - {Math.min(page * limit, totalCount)} of {totalCount}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-50 transition-colors rounded-full hover:bg-bg-surface"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-text-primary">Page {page}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * limit >= totalCount}
              className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-50 transition-colors rounded-full hover:bg-bg-surface"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
