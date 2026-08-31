import React, { useState, useRef, useEffect } from 'react';
import {
  Inbox,
  UserCheck,
  FolderKanban,
  AlertCircle,
  Users,
  Layers,
  FileCheck2,
  FileText,
  Settings,
  ChevronDown,
  Check,
  Plus,
  X,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useTeams } from '../../hooks/useTeams';
import * as Icons from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { currentWorkspace, setCurrentWorkspace, currentUser, currentTeam, setCurrentTeam } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const { workspaces, createWorkspaceAsync } = useWorkspaces();
  const { teams } = useTeams(currentWorkspace?.id);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(true);
  const [isTeamsSectionOpen, setIsTeamsSectionOpen] = useState(true);
  const [openTeams, setOpenTeams] = useState<Record<string, boolean>>({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceSlug, setNewWorkspaceSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleTeam = (teamId: string) => {
    setOpenTeams(prev => ({
      ...prev,
      [teamId]: !prev[teamId]
    }));
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // Restore current team from URL on mount/refresh
  useEffect(() => {
    if (teams && path.includes('/teams/')) {
      const parts = path.split('/teams/');
      if (parts.length === 2) {
        const teamId = parts[1].split('/')[0];
        if (teamId && (!currentTeam || currentTeam.id !== teamId)) {
          const match = teams.find(t => t.id === teamId);
          if (match) {
            setCurrentTeam(match);
            // Also ensure the accordion is open
            setOpenTeams(prev => ({ ...prev, [teamId]: true }));
          }
        }
      }
    } else if (currentTeam && !path.includes('/teams')) {
       setCurrentTeam(null);
    }
  }, [teams, path, currentTeam, setCurrentTeam]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewWorkspaceName(val);
    setNewWorkspaceSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || !newWorkspaceSlug.trim() || !currentUser) return;

    setIsSubmitting(true);
    setCreateError(null);

    try {
      const created = await createWorkspaceAsync({
        name: newWorkspaceName.trim(),
        slug: newWorkspaceSlug.trim(),
        created_by: currentUser.id,
      });

      if (created) {
        setCurrentWorkspace(created);
      }
      setIsCreateModalOpen(false);
      setNewWorkspaceName('');
      setNewWorkspaceSlug('');
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create workspace.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside className={`bg-bg-surface border border-border flex flex-col select-none shrink-0 font-sans relative transition-all duration-300 my-3 ml-3 mr-1.5 rounded-[12px] h-[calc(100vh-24px)] z-20 shadow-sm ${isCollapsed ? 'w-11' : 'w-[230px]'}`}>
      
      {/* Collapse Toggle (Always visible) */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute right-2 top-3.5 w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover z-50 transition-colors"
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
      </button>

      {/* Fading Contents Wrapper */}
      <div className={`flex flex-col h-full w-[230px] transition-opacity duration-300 overflow-hidden ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      
      {/* Workspace Selector */}
      <div className="h-14 pl-4 pr-11 flex items-center border-b border-white/10 relative shrink-0" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full flex items-center p-1.5 -m-1.5 rounded-md hover:bg-bg-surface/70 transition-colors group text-left min-w-0"
          title="Switch workspace"
        >
          <img
            src="/favicon.svg"
            alt="Reevolt Track Logo"
            className="w-7 h-7 rounded-md shrink-0 drop-shadow-sm mr-3"
          />
          <span className="font-karla font-medium text-base text-text-primary tracking-wide leading-tight truncate">
            {currentWorkspace?.name || 'No workspace'}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-text-secondary group-hover:text-text-primary transition-transform ml-1.5 shrink-0 ${
              isDropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div className="absolute left-3 right-3 top-full mt-1.5 bg-bg-surface border border-border rounded-md shadow-lg py-1 z-50 font-sans">
            <div className="px-3 py-1 text-[10px] uppercase font-semibold text-text-tertiary tracking-wider">
              Workspaces
            </div>

            <div className="max-h-48 overflow-y-auto">
              {(!workspaces || workspaces.length === 0) ? (
                <div className="px-3 py-2 text-sm text-text-tertiary italic">
                  No workspaces found
                </div>
              ) : (
                workspaces.map(ws => {
                  const isSelected = ws.id === currentWorkspace?.id;
                  return (
                    <button
                      key={ws.id}
                      onClick={() => {
                        setCurrentWorkspace(ws);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${
                        isSelected
                          ? 'bg-bg-surface/80 font-medium text-text-primary'
                          : 'text-text-secondary hover:bg-bg-surface/40 hover:text-text-primary'
                      }`}
                    >
                      <span className="truncate">{ws.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent-primary shrink-0 ml-1.5" />}
                    </button>
                  );
                })
              )}
            </div>

            <div className="h-[1px] bg-white/10 my-1" />

            <button
              onClick={() => {
                setIsDropdownOpen(false);
                setIsCreateModalOpen(true);
              }}
              className="w-full flex items-center space-x-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-surface/40 font-normal transition-colors text-left"
            >
              <Plus className="w-3.5 h-3.5 shrink-0 text-text-secondary" />
              <span>Add new workspace</span>
            </button>
          </div>
        )}
      </div>

      {/* Create Workspace Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-bg-surface border border-border rounded-md max-w-sm w-full p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2">
              <h3 className="text-sm font-karla font-semibold text-text-primary">Create Workspace</h3>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreateError(null);
                }}
                className="text-text-tertiary hover:text-text-primary p-1 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {createError && (
              <div className="mb-3 p-2 bg-status-error/10 border border-status-error/30 rounded text-[11px] text-status-error">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateWorkspace} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corp"
                  value={newWorkspaceName}
                  onChange={handleNameChange}
                  className="w-full px-2.5 py-1.5 text-xs bg-bg-surface border border-border rounded text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  URL Slug
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. acme-corp"
                  value={newWorkspaceSlug}
                  onChange={(e) => setNewWorkspaceSlug(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-bg-surface border border-border rounded text-text-primary font-mono focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                />
              </div>

              <div className="pt-2 border-t border-border/60 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setCreateError(null);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-surface rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newWorkspaceName.trim() || !newWorkspaceSlug.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-bg-base bg-accent-primary hover:bg-accent-primary-hover rounded disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Primary Triage Navigation */}
      <div className="px-3 space-y-0.5 mt-4 shrink-0">
        <button
          onClick={() => navigate(`/${currentWorkspace?.slug || ''}`)}
          className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            path === `/${currentWorkspace?.slug || ''}`
              ? 'bg-bg-surface-hover text-text-primary'
              : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
          }`}
        >
          <Inbox className="w-3.5 h-3.5 text-text-secondary" />
          <span>Home</span>
        </button>

        <button
          onClick={() => navigate(`/${currentWorkspace?.slug || ''}/my-issues`)}
          className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            path.endsWith('/my-issues')
              ? 'bg-bg-surface-hover text-text-primary'
              : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5 text-text-secondary" />
          <span>My Issues</span>
        </button>
      </div>

      {/* Workspace Section Hierarchy (Collapsible) */}
      <div className="flex-1 px-3 space-y-0.5 mt-6 overflow-y-auto">
        <button
          type="button"
          onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
          className="w-full flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider hover:text-text-primary rounded transition-colors group cursor-pointer"
        >
          <span>Workspace</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-text-tertiary group-hover:text-text-primary transition-transform duration-200 ${
              isWorkspaceOpen ? 'rotate-0' : '-rotate-90'
            }`}
          />
        </button>

        {isWorkspaceOpen && (
          <div className="space-y-0.5 pl-1 transition-all">
            <button
              onClick={() => {
                setCurrentTeam(null);
                navigate(`/${currentWorkspace?.slug || ''}/projects`);
              }}
              className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                path.endsWith('/projects') && !path.includes('/teams/')
                  ? 'bg-bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5 text-text-secondary" />
              <span>Projects</span>
            </button>

            <button
              onClick={() => {
                setCurrentTeam(null);
                navigate(`/${currentWorkspace?.slug || ''}/issues`);
              }}
              className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                path.endsWith('/issues') && !path.includes('/teams/')
                  ? 'bg-bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-text-secondary" />
              <span>Issues</span>
            </button>

            <button
              onClick={() => {
                setCurrentTeam(null);
                navigate(`/${currentWorkspace?.slug || ''}/testcases`);
              }}
              className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                path.endsWith('/testcases') && !path.includes('/teams/')
                  ? 'bg-bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5 text-text-secondary" />
              <span>Test Cases</span>
            </button>

            <button
              onClick={() => {
                setCurrentTeam(null);
                navigate(`/${currentWorkspace?.slug || ''}/members`);
              }}
              className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                path.endsWith('/members') && !path.includes('/teams/')
                  ? 'bg-bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-text-secondary" />
              <span>Members</span>
            </button>

            <button
              onClick={() => {
                setCurrentTeam(null);
                navigate(`/${currentWorkspace?.slug || ''}/teams`);
              }}
              className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                path.endsWith('/teams')
                  ? 'bg-bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-text-secondary" />
              <span>Teams</span>
            </button>
          </div>
        )}

        {/* Teams Section Hierarchy (Collapsible) */}
        <div className="pt-3">
          <button
            type="button"
            onClick={() => setIsTeamsSectionOpen(!isTeamsSectionOpen)}
            className="w-full flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider hover:text-text-primary rounded transition-colors group cursor-pointer mb-1"
          >
            <span>Teams</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-text-tertiary group-hover:text-text-primary transition-transform duration-200 ${
                isTeamsSectionOpen ? 'rotate-0' : '-rotate-90'
              }`}
            />
          </button>
          
          {isTeamsSectionOpen && (
            <div className="space-y-0.5">
              {teams && teams.map(team => {
            const isOpen = openTeams[team.id];
            const DynamicIcon = (Icons as any)[team.icon] || Icons.Hash;
            return (
              <div key={team.id} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => toggleTeam(team.id)}
                  className="w-full flex items-center justify-between px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary rounded transition-colors group cursor-pointer"
                >
                  <div className="flex items-center space-x-2">
                    <DynamicIcon className="w-3.5 h-3.5" />
                    <span className="truncate">{team.name}</span>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-text-tertiary group-hover:text-text-primary transition-transform duration-200 shrink-0 ${
                      isOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="space-y-0.5 pl-5 mt-0.5 transition-all">
                    <button
                      onClick={() => {
                        setCurrentTeam(team);
                        navigate(`/${currentWorkspace?.slug || ''}/teams/${team.id}/projects`);
                      }}
                      className={`w-full flex items-center space-x-2 px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        path.endsWith('/projects') && currentTeam?.id === team.id
                          ? 'bg-bg-surface-hover text-text-primary'
                          : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      <FolderKanban className="w-3.5 h-3.5" />
                      <span>Projects</span>
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTeam(team);
                        navigate(`/${currentWorkspace?.slug || ''}/teams/${team.id}/issues`);
                      }}
                      className={`w-full flex items-center space-x-2 px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        path.endsWith('/issues') && currentTeam?.id === team.id
                          ? 'bg-bg-surface-hover text-text-primary'
                          : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Issues</span>
                    </button>
                    <button
                      onClick={() => {
                        setCurrentTeam(team);
                        navigate(`/${currentWorkspace?.slug || ''}/teams/${team.id}/members`);
                      }}
                      className={`w-full flex items-center space-x-2 px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        path.endsWith('/members') && currentTeam?.id === team.id
                          ? 'bg-bg-surface-hover text-text-primary'
                          : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Members</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          
              <button
                onClick={() => navigate(`/${currentWorkspace?.slug || ''}/teams`)}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 mt-1 text-xs text-text-tertiary hover:text-text-primary font-normal transition-colors text-left"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Add team</span>
              </button>
            </div>
          )}
        </div>

        {/* Docs Section */}
        <div className="pt-3">
          <div className="px-2.5 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
            Docs
          </div>
          <button
            onClick={() => navigate(`/${currentWorkspace?.slug || ''}/docs`)}
            className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              path.endsWith('/docs')
                ? 'bg-bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-text-secondary" />
            <span>All Docs</span>
          </button>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="px-3 py-3 border-t border-white/10 space-y-1">
        <button
          onClick={() => navigate(`/${currentWorkspace?.slug || ''}/settings`)}
          className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            path.endsWith('/settings')
              ? 'bg-bg-surface-hover text-text-primary'
              : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>

        <button
          onClick={() => {
            import('../../lib/supabase').then(({ supabase }) => {
              supabase.auth.signOut();
            });
          }}
          className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-text-secondary hover:bg-status-error/10 hover:text-status-error"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          <span>Log out</span>
        </button>
      </div>
      </div>
    </aside>
  );
};
