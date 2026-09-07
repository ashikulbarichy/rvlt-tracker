import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FolderKanban, Plus, Search, Calendar, User, Trash2, X, AlertCircle, Folder, Edit2,
  LayoutGrid, LayoutList, ArrowUpDown, Check, Filter, CheckCircle2, Clock, ArrowLeft,
  CheckSquare, AlertTriangle, Layers
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SidebarToggle } from '../../components/layout/SidebarToggle';
import { useProjects } from '../../hooks/useProjects';
import { useTeams } from '../../hooks/useTeams';
import { useProfiles } from '../../hooks/useProfiles';
import { useWorkflowStates } from '../../hooks/useWorkflowStates';
import { useIssues } from '../../hooks/useIssues';
import { Project, ProjectStatus, IssuePriority } from '../../types/database';
import { CustomSelect } from '../common/CustomSelect';
import { DatePicker } from '../common/DatePicker';
import { formatIssueIdentifier } from '../../lib/identifier';
import { ConfirmModal } from '../common/ConfirmModal';
import { StatusBadge } from '../common/StatusBadge';

// Priority label colors (match the priority icon colors used across the app)
const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#F15E6C',
  high: '#FFA42B',
  medium: '#F5C842',
  low: '#509BF5',
};

export const ProjectsView: React.FC = () => {
  const { currentWorkspace, currentUser, userRole, currentTeam, setSelectedIssue, setIsNewIssueModalOpen } = useApp();
  const { projects, isLoading, createProject, updateProject, deleteProject } = useProjects({
    workspaceId: currentWorkspace?.id
  });
  const { teams } = useTeams(currentWorkspace?.id);
  const { profiles } = useProfiles();
  const { workflowStates } = useWorkflowStates();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(currentTeam?.id || 'all');
  
  // In-app Delete Project Confirmation State
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string; closeDetail?: boolean } | null>(null);
  
  // Slide-over Create Drawer State
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [isCreateRendered, setIsCreateRendered] = useState(false);
  const [isCreateAnimated, setIsCreateAnimated] = useState(false);

  // Full-card Project Detail View State
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('rvlt-projects-view-mode');
      return saved === 'list' || saved === 'grid' ? saved : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [sortBy, setSortBy] = useState<'name' | 'target_date' | 'progress' | 'status'>('name');

  // Persist view mode across refreshes
  useEffect(() => {
    try {
      localStorage.setItem('rvlt-projects-view-mode', viewMode);
    } catch { /* storage unavailable */ }
  }, [viewMode]);
  
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);

  const sortMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const teamMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedTeamId(currentTeam?.id || 'all');
  }, [currentTeam?.id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setIsSortMenuOpen(false);
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setIsViewMenuOpen(false);
      if (teamMenuRef.current && !teamMenuRef.current.contains(e.target as Node)) setIsTeamMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Create Drawer Transitions
  useEffect(() => {
    if (isCreateDrawerOpen) {
      setIsCreateRendered(true);
      const raf = requestAnimationFrame(() => {
        setIsCreateAnimated(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsCreateAnimated(false);
      const timer = setTimeout(() => {
        setIsCreateRendered(false);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [isCreateDrawerOpen]);

  const handleCloseCreateDrawer = () => {
    setIsCreateAnimated(false);
    setTimeout(() => {
      setIsCreateDrawerOpen(false);
    }, 220);
  };

  // Handle Project Detail Transitions
  useEffect(() => {
    if (selectedProject) {
      const raf = requestAnimationFrame(() => {
        setIsDetailOpen(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsDetailOpen(false);
    }
  }, [selectedProject]);

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    setTimeout(() => {
      setSelectedProject(null);
    }, 220);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreateDrawerOpen) handleCloseCreateDrawer();
        else if (selectedProject) handleCloseDetail();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateDrawerOpen, selectedProject]);

  // Form State for Creation / Editing
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('in_progress');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state when opening detail view
  useEffect(() => {
    if (selectedProject) {
      setName(selectedProject.name || '');
      setKey(selectedProject.key || '');
      setDescription(selectedProject.description || '');
      setTeamId(selectedProject.team_id || '');
      setLeadId(selectedProject.lead_id || '');
      setTargetDate(selectedProject.target_date || '');
      setStatus(selectedProject.status || 'in_progress');
      setErrorMessage(null);
    }
  }, [selectedProject]);

  const isAdmin = userRole === 'admin' || currentWorkspace?.created_by === currentUser?.id;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!key || key === name.slice(0, 4).toUpperCase()) {
      setKey(val.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, ''));
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !name.trim()) return;

    const chosenTeamId = teamId || (teams && teams[0]?.id);
    if (!chosenTeamId) {
      setErrorMessage('Please select a team for this project.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await createProject({
        workspace_id: currentWorkspace.id,
        team_id: chosenTeamId,
        name: name.trim(),
        key: key.trim().toUpperCase() || 'PROJ',
        description: description.trim() || null,
        lead_id: leadId || currentUser?.id || null,
        target_date: targetDate || null,
        status: status || 'in_progress',
      });

      setName('');
      setKey('');
      setDescription('');
      setTargetDate('');
      handleCloseCreateDrawer();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProjectField = async (field: keyof Project, val: any) => {
    if (!selectedProject || !isAdmin) return;
    try {
      await updateProject({
        id: selectedProject.id,
        [field]: val
      });
      setSelectedProject(prev => prev ? { ...prev, [field]: val } : null);
    } catch (err: any) {
      console.error('Failed to update project field:', err);
    }
  };

  const completedStateIds = useMemo(() => {
    return new Set(
      (workflowStates || [])
        .filter(s => s.category === 'completed' || s.category === 'canceled')
        .map(s => s.id)
    );
  }, [workflowStates]);

  const enrichedProjects = useMemo(() => {
    return (projects || []).map(p => {
      let totalIssues = 0;
      let completedIssues = 0;
      if (p.issues) {
        totalIssues = p.issues.length;
        completedIssues = p.issues.filter(i => completedStateIds.has(i.state_id)).length;
      }
      const progress = totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0;
  
      let daysLeft: number | null = null;
      let isOverdue = false;
      let deliveryFailed = false;
  
      if (p.target_date) {
        const target = new Date(p.target_date);
        const now = new Date();
        target.setHours(0,0,0,0);
        now.setHours(0,0,0,0);
        const diffTime = target.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        daysLeft = diffDays;
        if (diffDays < 0) {
          isOverdue = true;
          if (p.status !== 'completed' && p.status !== 'canceled') {
            deliveryFailed = true;
          }
        }
      }
  
      return { ...p, totalIssues, completedIssues, progress, daysLeft, isOverdue, deliveryFailed };
    });
  }, [projects, completedStateIds]);

  const filteredProjects = useMemo(() => {
    return enrichedProjects.filter(p => {
      if (selectedTeamId !== 'all' && p.team_id !== selectedTeamId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'progress') return b.progress - a.progress;
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      if (sortBy === 'target_date') {
        if (!a.target_date) return 1;
        if (!b.target_date) return -1;
        return new Date(a.target_date).getTime() - new Date(b.target_date).getTime();
      }
      return 0;
    });
  }, [enrichedProjects, selectedTeamId, searchQuery, sortBy]);

  // Query issues for the active selected project
  const { issues: projectIssues } = useIssues({
    workspaceId: currentWorkspace?.id,
    projectId: selectedProject?.id
  });

  const getStatusBadge = (st: ProjectStatus) => {
    switch (st) {
      case 'planned':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-bg-surface-hover border border-transparent text-text-secondary">Planning</span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-accent-muted text-accent-primary border border-transparent ">In Progress</span>;
      case 'paused':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-status-warning/10 text-status-warning border border-transparent ">Paused</span>;
      case 'completed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-status-success/10 text-status-success border border-transparent ">Completed</span>;
      case 'canceled':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-status-error/10 text-status-error border border-transparent ">Canceled</span>;
    }
  };

  const renderTargetDateBadge = (targetDateStr?: string | null, daysLeft?: number | null, isOverdue?: boolean, isCompleted?: boolean) => {
    if (!targetDateStr) return <span className="text-text-tertiary">No target date</span>;
    const d = new Date(targetDateStr);
    const formatted = d.toLocaleDateString();

    if (isCompleted) {
      return (
        <span className="inline-flex items-center space-x-1 text-[11px] text-text-tertiary">
          <CheckCircle2 className="w-3 h-3 text-status-success shrink-0" />
          <span>{formatted}</span>
        </span>
      );
    }

    if (isOverdue || (daysLeft !== null && daysLeft !== undefined && daysLeft < 0)) {
      const overdueDays = daysLeft !== null && daysLeft !== undefined ? Math.abs(daysLeft) : 1;
      return (
        <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-status-error bg-status-error/10 border border-transparent px-2 py-0.5 rounded-full">
          <AlertTriangle className="w-3 h-3 text-status-error shrink-0" />
          <span>Overdue {overdueDays}d</span>
        </span>
      );
    }

    if (daysLeft === 0) {
      return (
        <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-status-warning bg-status-warning/10 border border-transparent px-2 py-0.5 rounded-full">
          <Clock className="w-3 h-3 text-status-warning shrink-0" />
          <span>Due Today ({formatted})</span>
        </span>
      );
    }

    if (daysLeft !== null && daysLeft !== undefined && daysLeft <= 2) {
      return (
        <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-status-warning bg-status-warning/10 border border-transparent px-1.5 py-0.5 rounded-full">
          <Clock className="w-3 h-3 text-status-warning shrink-0" />
          <span>{daysLeft}d left ({formatted})</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center space-x-1 text-[11px] text-text-secondary">
        <Calendar className="w-3 h-3 text-text-tertiary shrink-0" />
        <span>{formatted}</span>
      </span>
    );
  };

  const activeProjectEnriched = useMemo(() => {
    if (!selectedProject) return null;
    return enrichedProjects.find(p => p.id === selectedProject.id) || selectedProject;
  }, [selectedProject, enrichedProjects]);

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative">
      {/* Subheader Toolbar */}
      <div className="px-3 sm:px-6 py-2.5 sm:py-3 bg-transparent flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <SidebarToggle />
          <div className="flex items-center space-x-2">
            <FolderKanban className="w-4 h-4 text-accent-primary" />
            <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
              Projects
            </span>
          </div>
          <span className="text-[11px] text-text-tertiary font-mono">
            {filteredProjects.length} total
          </span>

          {/* Team Filter */}
          <div className="relative" ref={teamMenuRef}>
            <button
              onClick={() => setIsTeamMenuOpen(!isTeamMenuOpen)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-bg-surface-raised hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary border border-transparent text-xs transition-colors"
            >
              <Filter className="w-3 h-3" />
              <span>{selectedTeamId === 'all' ? 'All Teams' : teams?.find(t => t.id === selectedTeamId)?.name || 'Team'}</span>
            </button>
            {isTeamMenuOpen && (
              <div className="absolute left-0 mt-1 w-44 bg-bg-surface-raised border border-transparent rounded-md shadow-lg py-1 z-30">
                <button
                  onClick={() => { setSelectedTeamId('all'); setIsTeamMenuOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-bg-surface-hover ${selectedTeamId === 'all' ? 'text-accent-primary font-medium' : 'text-text-secondary'}`}
                >
                  <span>All Teams</span>
                  {selectedTeamId === 'all' && <Check className="w-3.5 h-3.5" />}
                </button>
                {(teams || []).map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTeamId(t.id); setIsTeamMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-bg-surface-hover ${selectedTeamId === t.id ? 'text-accent-primary font-medium' : 'text-text-secondary'}`}
                  >
                    <span className="truncate">{t.name}</span>
                    {selectedTeamId === t.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center space-x-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-32 sm:w-44 pl-8 pr-2.5 py-1 text-xs bg-bg-surface-raised border border-transparent rounded-full text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-full bg-bg-surface-raised p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-full text-xs transition-colors ${viewMode === 'grid' ? 'bg-bg-surface-hover text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-full text-xs transition-colors ${viewMode === 'list' ? 'bg-bg-surface-hover text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
              title="List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Create Button */}
          {isAdmin && (
            <button
              onClick={() => setIsCreateDrawerOpen(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Project</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
        </div>
      </div>

      {/* Projects Content Body */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 no-scrollbar scrollbar-none">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-text-secondary">
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FolderKanban className="w-8 h-8 text-text-tertiary mx-auto" />
            <h3 className="text-sm font-semibold text-text-primary font-karla">No projects found</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Create structured projects to organize roadmap deliverables, track progress, and group issues.
            </p>
            {isAdmin && (
              <button
                onClick={() => setIsCreateDrawerOpen(true)}
                className="px-3.5 py-1.5 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors"
              >
                Create first project
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
            {filteredProjects.map((project: any) => {
              const leadProfile = profiles?.find(p => p.id === project.lead_id);
              const team = teams?.find(t => t.id === project.team_id);

              return (
                <div
                  key={project.id}
                  onClick={() => setSelectedProject(project)}
                  className="bg-bg-surface-raised border border-transparent hover:bg-bg-surface-hover rounded-lg p-5 flex flex-col justify-between space-y-4 cursor-pointer transition-all hover:bg-bg-surface-hover/60 group"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <span className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-bg-surface-hover border border-transparent text-text-secondary">
                        {project.key}
                      </span>
                      {getStatusBadge(project.status)}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-text-primary group-hover:text-accent-primary transition-colors">
                        {project.name}
                      </h4>
                      {team && (
                        <p className="text-[11px] text-text-tertiary mt-0.5">
                          {team.name}
                        </p>
                      )}
                    </div>

                    {project.description && (
                      <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                        {project.description}
                      </p>
                    )}
                  </div>

                  {/* Progress & Meta */}
                  <div className="space-y-3 pt-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-text-tertiary">Progress</span>
                        <span className="font-medium text-text-primary">{project.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-bg-surface-raised rounded-full overflow-hidden">
                        <div className="h-full bg-accent-primary transition-all duration-300" style={{ width: `${project.progress}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                      <div>
                        {renderTargetDateBadge(project.target_date, project.daysLeft, project.isOverdue, project.status === 'completed')}
                      </div>

                      {leadProfile && (
                        <div className="flex items-center space-x-1.5">
                          <img
                            src={leadProfile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(leadProfile.full_name || leadProfile.email)}&background=282828&color=B3B3B3&rounded=true`}
                            alt="Lead"
                            className="w-4 h-4 rounded-full object-cover shrink-0"
                          />
                          <span className="text-text-secondary truncate max-w-[90px]">{leadProfile.full_name?.split(' ')[0] || 'Lead'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-transparent rounded-lg bg-bg-surface-raised overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-bg-surface-raised/50 border-b border-border text-[11px] font-medium text-text-secondary">
                <tr>
                  <th className="px-4 py-2.5 w-1/3">Project</th>
                  <th className="px-4 py-2.5 w-1/4">Progress</th>
                  <th className="px-4 py-2.5 w-32">Status</th>
                  <th className="px-4 py-2.5 w-32">Target</th>
                  <th className="px-4 py-2.5">Lead</th>
                  {isAdmin && <th className="px-4 py-2.5 w-12 text-center"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredProjects.map((project: any) => {
                  const leadProfile = profiles?.find(p => p.id === project.lead_id);
                  const team = teams?.find(t => t.id === project.team_id);
                  return (
                    <tr 
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className="hover:bg-bg-surface-hover cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center space-x-3">
                          <span className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-bg-surface-raised border border-transparent text-text-secondary shrink-0">
                            {project.key}
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-text-primary truncate">{project.name}</div>
                            {team && <div className="text-[10px] text-text-tertiary truncate">{team.name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center space-x-3">
                          <span className="text-[11px] font-medium text-text-primary w-8">{project.progress}%</span>
                          <div className="flex-1 max-w-[120px] h-1.5 bg-bg-surface-raised rounded-full overflow-hidden">
                            <div className="h-full bg-accent-primary" style={{ width: `${project.progress}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {getStatusBadge(project.status)}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {renderTargetDateBadge(project.target_date, project.daysLeft, project.isOverdue, project.status === 'completed')}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {leadProfile ? (
                          <div className="flex items-center space-x-2">
                            <img
                              src={leadProfile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(leadProfile.full_name || leadProfile.email)}&background=282828&color=B3B3B3&rounded=true`}
                              alt="Lead"
                              className="w-4 h-4 rounded-full object-cover shrink-0"
                            />
                            <span className="truncate">{leadProfile.full_name?.split(' ')[0] || 'Lead'}</span>
                          </div>
                        ) : <span className="text-text-tertiary">-</span>}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 align-middle text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingProject({ id: project.id, name: project.name, closeDetail: false });
                            }}
                            className="p-1 rounded-sm text-text-tertiary hover:text-status-error transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete Project"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Specific Project Detail: Opens Full View on the Right Card */}
      {selectedProject && (
        <div 
          className={`absolute inset-0 z-30 bg-bg-surface flex flex-col overflow-hidden transform transition-transform duration-200 ease-out font-sans ${isDetailOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}`}
        >
          {/* Project View Header */}
          <div className="px-6 py-3.5 flex items-center justify-between shrink-0 bg-bg-surface">
            <div className="flex items-center space-x-3 flex-1 min-w-0 mr-4">
              <button
                onClick={handleCloseDetail}
                className="flex items-center space-x-1.5 px-2.5 py-1 -ml-1 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors shrink-0"
                title="Back to projects (Esc)"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-xs font-medium">Projects</span>
              </button>

              <div className="w-px h-4 bg-border shrink-0" />

              <span className="font-sans text-xs font-semibold px-2 py-0.5 rounded-full bg-bg-surface-raised border border-transparent text-text-secondary shrink-0">
                {selectedProject.key}
              </span>

              <h2 className="text-sm font-semibold text-text-primary truncate">
                {selectedProject.name}
              </h2>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {isAdmin && (
                <button
                  onClick={() => {
                    setDeletingProject({ id: selectedProject.id, name: selectedProject.name, closeDetail: true });
                  }}
                  className="p-1.5 rounded-full text-text-secondary hover:text-status-error hover:bg-bg-surface transition-colors"
                  title="Delete Project"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleCloseDetail}
                className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Project View Body: 2 Columns */}
          <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-border min-h-0 no-scrollbar scrollbar-none">
            {/* Left Column: Description & Issues list for this project */}
            <div className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 space-y-6 overflow-y-auto no-scrollbar scrollbar-none">
              {/* Project Progress Banner */}
              <div className="bg-bg-surface-raised border border-transparent rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                      Progress & Roadmap
                    </span>
                    {getStatusBadge(selectedProject.status)}
                  </div>
                  <span className="text-xs font-semibold text-accent-primary">
                    {(activeProjectEnriched as any)?.progress || 0}% Complete
                  </span>
                </div>

                <div className="w-full h-2 bg-bg-surface-raised border border-transparent rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent-primary transition-all duration-300"
                    style={{ width: `${(activeProjectEnriched as any)?.progress || 0}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-text-secondary pt-1">
                  <span>
                    {(activeProjectEnriched as any)?.completedIssues || 0} of {(activeProjectEnriched as any)?.totalIssues || 0} issues resolved
                  </span>
                  {selectedProject.target_date && (
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-text-tertiary" />
                      <span>Target: {new Date(selectedProject.target_date).toLocaleDateString()}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                  Description & Scope
                </h3>
                <div className="bg-bg-surface-raised border border-transparent rounded-md p-4 text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
                  {selectedProject.description || 'No description provided for this project.'}
                </div>
              </div>

              {/* Issues in this project */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-text-secondary" />
                    <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                      Project Issues ({projectIssues?.length || 0})
                    </h3>
                  </div>

                  <button
                    onClick={() => setIsNewIssueModalOpen(true)}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-bg-surface-raised hover:bg-bg-surface-hover text-text-primary border border-transparent text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-accent-primary" />
                    <span>Add Issue</span>
                  </button>
                </div>

                <div className="border border-transparent rounded-md bg-bg-surface-raised overflow-hidden">
                  {(!projectIssues || projectIssues.length === 0) ? (
                    <div className="p-6 text-center text-xs text-text-secondary">
                      No issues created for this project yet. Click "Add Issue" to assign tasks to this project.
                    </div>
                  ) : (
                    projectIssues.map(issue => (
                      <div
                        key={issue.id}
                        onClick={() => setSelectedIssue(issue)}
                        className="px-4 py-3 flex items-center justify-between hover:bg-bg-surface-hover cursor-pointer transition-colors"
                      >
                        <div className="flex items-center space-x-3 min-w-0 flex-1 mr-4">
                          <span className="font-id text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-bg-surface-hover border border-transparent text-text-secondary shrink-0">
                            {formatIssueIdentifier(issue, currentWorkspace)}
                          </span>
                          <span className="text-xs font-medium text-text-primary truncate">
                            {issue.title}
                          </span>
                        </div>

                        <div className="flex items-center shrink-0">
                          <div className="w-24 flex justify-end">
                            {issue.status && (
                              <StatusBadge name={issue.status.name} color={issue.status.color} />
                            )}
                          </div>
                          <span
                            className="w-16 text-right text-[10px] font-medium capitalize"
                            style={{ color: PRIORITY_COLORS[issue.priority as string] || '#727272' }}
                          >
                            {issue.priority}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Sidebar: Metadata & Quick Controls */}
            <div className="w-full lg:w-80 shrink-0 p-6 space-y-5 bg-bg-surface overflow-y-auto no-scrollbar scrollbar-none">
              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">
                  Status
                </label>
                {isAdmin ? (
                  <CustomSelect
                    value={selectedProject.status}
                    onChange={(val) => handleUpdateProjectField('status', val as ProjectStatus)}
                    options={[
                      { value: 'planned', label: 'Planning' },
                      { value: 'in_progress', label: 'In Progress' },
                      { value: 'paused', label: 'Paused' },
                      { value: 'completed', label: 'Completed' },
                      { value: 'canceled', label: 'Canceled' },
                    ]}
                    size="sm"
                    className="w-full"
                  />
                ) : (
                  <div>{getStatusBadge(selectedProject.status)}</div>
                )}
              </div>

              {/* Team */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">
                  Team
                </label>
                <div className="text-xs font-medium text-text-primary px-2.5 py-1.5 bg-bg-surface-raised border border-transparent rounded-sm">
                  {teams?.find(t => t.id === selectedProject.team_id)?.name || 'General Workspace'}
                </div>
              </div>

              {/* Project Lead */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">
                  Project Lead
                </label>
                {(() => {
                  const lead = profiles?.find(p => p.id === selectedProject.lead_id);
                  return lead ? (
                    <div className="flex items-center space-x-2 px-3 py-1.5 bg-bg-surface-raised border border-transparent rounded-full text-xs">
                      <img
                        src={lead.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.full_name || lead.email)}&background=282828&color=B3B3B3&rounded=true`}
                        alt="Lead"
                        className="w-4 h-4 rounded-full object-cover shrink-0"
                      />
                      <span className="text-text-primary truncate font-medium">{lead.full_name || lead.email}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-text-tertiary px-2.5 py-1.5 bg-bg-surface-raised border border-transparent rounded-sm">
                      No lead assigned
                    </div>
                  );
                })()}
              </div>

              {/* Target Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">
                  Target Date
                </label>
                <div className="pt-0.5">
                  {renderTargetDateBadge(
                    selectedProject.target_date,
                    (activeProjectEnriched as any)?.daysLeft,
                    (activeProjectEnriched as any)?.isOverdue,
                    selectedProject.status === 'completed'
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="pt-4 border-t border-border space-y-2 text-xs text-text-secondary">
                <div className="flex justify-between">
                  <span>Created</span>
                  <span className="font-medium text-text-primary">
                    {new Date(selectedProject.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right-Side Slide-Over Drawer for New Project Creation */}
      {isCreateRendered && (
        <div 
          className={`fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-[1px] transition-opacity duration-200 ease-out font-sans ${isCreateAnimated ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseCreateDrawer();
          }}
        >
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
            <div className={`w-screen max-w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-bg-surface border-l border-border shadow-2xl flex flex-col h-full overflow-hidden transform transition-transform duration-200 ease-out ${isCreateAnimated ? 'translate-x-0' : 'translate-x-full'}`}>
              {/* Drawer Header */}
              <div className="px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0 bg-bg-surface">
                <div className="flex items-center space-x-2">
                  <FolderKanban className="w-4 h-4 text-accent-primary" />
                  <h2 className="text-sm font-semibold text-text-primary">
                    Create New Project
                  </h2>
                </div>
                <button
                  onClick={handleCloseCreateDrawer}
                  className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleCreateProject} className="p-4 sm:p-6 space-y-4 bg-bg-surface overflow-y-auto no-scrollbar scrollbar-none flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  {errorMessage && (
                    <div className="p-2.5 bg-status-error/10 border border-transparent rounded-sm text-xs text-status-error flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      Project Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mobile App Redesign"
                      value={name}
                      onChange={handleNameChange}
                      className="w-full text-xs bg-bg-surface-raised border border-transparent rounded-sm px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">
                        Key Identifier *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. MOB"
                        value={key}
                        onChange={e => setKey(e.target.value.toUpperCase())}
                        className="w-full text-xs bg-bg-surface-raised border border-transparent rounded-sm px-2.5 py-1.5 font-mono uppercase text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">
                        Team *
                      </label>
                      <CustomSelect
                        value={teamId || (teams && teams[0]?.id) || ''}
                        onChange={setTeamId}
                        options={(teams || []).map(t => ({ value: t.id, label: t.name }))}
                        size="sm"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      Description & Scope
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Project vision, goals, and key milestones..."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full text-xs bg-bg-surface-raised border border-transparent rounded-sm p-3 text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">
                        Project Lead
                      </label>
                      <CustomSelect
                        value={leadId}
                        onChange={setLeadId}
                        options={[
                          { value: '', label: 'Assign Lead (Auto)' },
                          ...(profiles || []).map(p => ({ value: p.id, label: p.full_name || p.email }))
                        ]}
                        size="sm"
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">
                        Target Completion Date
                      </label>
                      <DatePicker value={targetDate} onChange={setTargetDate} placeholder="Target date" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-text-secondary mb-1">
                      Initial Status
                    </label>
                    <CustomSelect
                      value={status}
                      onChange={(val) => setStatus(val as ProjectStatus)}
                      options={[
                        { value: 'planned', label: 'Planning' },
                        { value: 'in_progress', label: 'In Progress' },
                        { value: 'paused', label: 'Paused' },
                        { value: 'completed', label: 'Completed' },
                      ]}
                      size="sm"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 mt-6 border-t border-border flex items-center justify-end space-x-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleCloseCreateDrawer}
                    className="px-3.5 py-1.5 rounded-full text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !name.trim()}
                    className="px-4 py-1.5 rounded-full bg-accent-primary hover:bg-accent-primary-hover text-button-text text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Project'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingProject}
        title="Delete Project"
        message={`Are you sure you want to delete project "${deletingProject?.name}"? All associated tasks will remain but will no longer be linked to this project.`}
        confirmText="Delete Project"
        variant="danger"
        onConfirm={() => {
          if (deletingProject) {
            deleteProject(deletingProject.id);
            if (deletingProject.closeDetail) handleCloseDetail();
            setDeletingProject(null);
          }
        }}
        onCancel={() => setDeletingProject(null)}
      />
    </div>
  );
};
