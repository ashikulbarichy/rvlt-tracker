import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import {
  Workspace,
  Team,
  Project,
  Issue,
  Profile,
  UserRole,
  IssuePriority
} from '../types/database';


interface AppContextType {
  currentUser: Profile | null;
  userRole: UserRole;
  
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (ws: Workspace | null) => void;
  
  currentTeam: Team | null;
  setCurrentTeam: (team: Team | null) => void;
  
  currentProject: Project | null;
  setCurrentProject: (proj: Project | null) => void;
  

  
  selectedIssue: Issue | null;
  setSelectedIssue: (issue: Issue | null) => void;
  
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  
  isNotificationOpen: boolean;
  setIsNotificationOpen: (open: boolean) => void;
  toggleNotifications: () => void;
  
  isNewIssueModalOpen: boolean;
  setIsNewIssueModalOpen: (open: boolean) => void;
  
  isNewTestCaseModalOpen: boolean;
  setIsNewTestCaseModalOpen: (open: boolean) => void;
  
  isSearchModalOpen: boolean;
  setIsSearchModalOpen: (open: boolean) => void;

  isShortcutsModalOpen: boolean;
  setIsShortcutsModalOpen: (open: boolean) => void;
  
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  
  filterPriority: IssuePriority | 'all';
  setFilterPriority: (priority: IssuePriority | 'all') => void;
  
  filterAssigneeId: string | 'all';
  setFilterAssigneeId: (userId: string | 'all') => void;
}

import { useCurrentProfile } from '../hooks/useProfiles';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useUserWorkspaceRole } from '../hooks/useWorkspaceMembers';
import { useTeams } from '../hooks/useTeams';

const AppContext = createContext<AppContextType | undefined>(undefined);

import { useLocation, useNavigate } from 'react-router-dom';

const getSlugFromPath = (pathname: string): string | null => {
  const path = pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return null;
  const segment = path.split('/')[0];
  if (segment === 'login' || segment === 'signup' || segment.includes('.')) return null;
  return segment;
};

export const AppProvider: React.FC<{ children: React.ReactNode, session?: Session | null }> = ({ children, session }) => {
  const userId = session?.user?.id;
  const { data: liveProfile } = useCurrentProfile(userId);

  const fallbackUser: Profile | null = session?.user ? {
    id: session.user.id,
    email: session.user.email || '',
    full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
    avatar_url: session.user.user_metadata?.avatar_url || '',
    created_at: session.user.created_at,
    updated_at: session.user.updated_at || session.user.created_at
  } : null;

  const currentUser: Profile | null = liveProfile ? {
    ...fallbackUser,
    ...liveProfile,
    email: liveProfile.email || fallbackUser?.email || ''
  } : fallbackUser;

  // Workspaces query & dynamic currentWorkspace
  const { workspaces, isLoading: isLoadingWorkspaces, createWorkspace } = useWorkspaces();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  // Sync workspace selection from URL path slug on load and updates
  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return;

    const pathSlug = getSlugFromPath(location.pathname);
    if (pathSlug) {
      const match = workspaces.find(w => w.slug.toLowerCase() === pathSlug.toLowerCase());
      if (match) {
        setSelectedWorkspaceId(match.id);
        return;
      }
    }

    const defaultWs = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0];
    if (defaultWs) {
      setSelectedWorkspaceId(defaultWs.id);
      if (!getSlugFromPath(location.pathname)) {
        navigate(`/${defaultWs.slug}`, { replace: true });
      }
    }
  }, [workspaces, location.pathname, selectedWorkspaceId, navigate]);

  const currentWorkspace: Workspace | null = (workspaces && workspaces.length > 0)
    ? (workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0])
    : null;

  // If user has zero workspaces, auto-create a default one (guarded to run once)
  const isCreatingRef = React.useRef(false);
  React.useEffect(() => {
    if (!isLoadingWorkspaces && Array.isArray(workspaces) && workspaces.length === 0 && currentUser?.id && !isCreatingRef.current) {
      isCreatingRef.current = true;
      const defaultSlug = `workspace-${Math.random().toString(36).substring(2, 8)}`;
      createWorkspace(
        {
          name: `${currentUser.full_name ? currentUser.full_name.split(' ')[0] : 'My'}'s Workspace`,
          slug: defaultSlug,
          created_by: currentUser.id
        },
        {
          onError: (err) => {
            console.warn("Auto-creation of default workspace deferred:", err);
          }
        }
      );
    }
  }, [isLoadingWorkspaces, workspaces, currentUser, createWorkspace]);

  const setCurrentWorkspace = (ws: Workspace | null) => {
    setSelectedWorkspaceId(ws?.id || null);
    if (ws && getSlugFromPath(location.pathname) !== ws.slug) {
      navigate(`/${ws.slug}`);
    }
  };

  // Dynamic user role in the current workspace
  const { data: dynamicRole } = useUserWorkspaceRole(currentWorkspace?.id, currentUser?.id);
  const isCreator = !currentWorkspace || (!!currentUser && (!currentWorkspace.created_by || currentWorkspace.created_by === currentUser.id));
  const userRole: UserRole = isCreator ? 'admin' : (dynamicRole || 'admin');

  // Dynamic teams in current workspace
  const { teams } = useTeams(currentWorkspace?.id);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const currentTeam: Team | null = (teams && teams.length > 0)
    ? (teams.find(t => t.id === selectedTeamId) || teams[0])
    : null;

  const setCurrentTeam = (team: Team | null) => {
    setSelectedTeamId(team?.id || null);
  };

  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const toggleMobileSidebar = () => setIsMobileSidebarOpen(prev => !prev);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const toggleSidebar = () => {
    // If mobile width, toggle mobile sidebar drawer; otherwise toggle desktop collapse
    if (window.innerWidth < 1024) {
      setIsMobileSidebarOpen(prev => !prev);
    } else {
      setIsSidebarCollapsed(prev => !prev);
    }
  };

  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const toggleNotifications = () => setIsNotificationOpen(prev => !prev);

  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [isNewIssueModalOpen, setIsNewIssueModalOpen] = useState<boolean>(false);
  const [isNewTestCaseModalOpen, setIsNewTestCaseModalOpen] = useState<boolean>(false);

  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<IssuePriority | 'all'>('all');
  const [filterAssigneeId, setFilterAssigneeId] = useState<string | 'all'>('all');

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    let pendingGKey = false;
    let gKeyTimeout: any = null;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when user is typing in form controls
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInputActive) return;

      // 1. Open Search: Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen(true);
        return;
      }

      // 2. Toggle Sidebar: Cmd+B / Ctrl+B
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // 3. Open Shortcuts modal: '?'
      if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsModalOpen(prev => !prev);
        return;
      }

      // 3. Create new issue: 'c' or 'C'
      if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsNewIssueModalOpen(true);
        return;
      }

      // 4. Create new test case: 't' or 'T'
      if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!pendingGKey) {
          e.preventDefault();
          setIsNewTestCaseModalOpen(true);
          return;
        }
      }

      // 5. 'G' sequential navigation (G then H/I/P/T/S)
      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        pendingGKey = true;
        clearTimeout(gKeyTimeout);
        gKeyTimeout = setTimeout(() => {
          pendingGKey = false;
        }, 1000);
        return;
      }

      if (pendingGKey && currentWorkspace?.slug) {
        pendingGKey = false;
        clearTimeout(gKeyTimeout);
        const k = e.key.toLowerCase();
        if (k === 'h') {
          e.preventDefault();
          navigate(`/${currentWorkspace.slug}`);
        } else if (k === 'i') {
          e.preventDefault();
          navigate(`/${currentWorkspace.slug}/issues`);
        } else if (k === 'p') {
          e.preventDefault();
          navigate(`/${currentWorkspace.slug}/projects`);
        } else if (k === 't') {
          e.preventDefault();
          navigate(`/${currentWorkspace.slug}/testcases`);
        } else if (k === 's') {
          e.preventDefault();
          navigate(`/${currentWorkspace.slug}/settings`);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      clearTimeout(gKeyTimeout);
    };
  }, [currentWorkspace?.slug, navigate]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        userRole,
        currentWorkspace,
        setCurrentWorkspace,
        currentTeam,
        setCurrentTeam,
        currentProject,
        setCurrentProject,

        selectedIssue,
        setSelectedIssue,
        isMobileSidebarOpen,
        setIsMobileSidebarOpen,
        toggleMobileSidebar,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        toggleSidebar,
        isNotificationOpen,
        setIsNotificationOpen,
        toggleNotifications,
        isNewIssueModalOpen,
        setIsNewIssueModalOpen,
        isNewTestCaseModalOpen,
        setIsNewTestCaseModalOpen,
        isSearchModalOpen,
        setIsSearchModalOpen,
        isShortcutsModalOpen,
        setIsShortcutsModalOpen,
        searchQuery,
        setSearchQuery,
        filterPriority,
        setFilterPriority,
        filterAssigneeId,
        setFilterAssigneeId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
