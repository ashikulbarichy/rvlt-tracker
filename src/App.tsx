import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { SidebarToggle } from './components/layout/SidebarToggle';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';
import { LoginView } from './components/auth/LoginView';
import { ResetPasswordView } from './components/auth/ResetPasswordView';
// Every page is its own chunk: the entry bundle is just the shell (layout, sidebar,
// login). Panels outside the routes load on first open -- see OnceOpened.
const GlobalSearchModal = lazy(() => import('./components/layout/GlobalSearchModal').then(m => ({ default: m.GlobalSearchModal })));
const KeyboardShortcutsModal = lazy(() => import('./components/layout/KeyboardShortcutsModal').then(m => ({ default: m.KeyboardShortcutsModal })));
const TicketListView = lazy(() => import('./components/tickets/TicketListView').then(m => ({ default: m.TicketListView })));
const TicketDetailModal = lazy(() => import('./components/tickets/TicketDetailModal').then(m => ({ default: m.TicketDetailModal })));
const NewTicketModal = lazy(() => import('./components/tickets/NewTicketModal').then(m => ({ default: m.NewTicketModal })));
const TestCaseListView = lazy(() => import('./components/testcases/TestCaseListView').then(m => ({ default: m.TestCaseListView })));
const NewTestCaseModal = lazy(() => import('./components/testcases/NewTestCaseModal').then(m => ({ default: m.NewTestCaseModal })));
const DashboardView = lazy(() => import('./components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const SettingsView = lazy(() => import('./components/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const MemberSettings = lazy(() => import('./components/settings/MemberSettings').then(m => ({ default: m.MemberSettings })));
const TeamSettings = lazy(() => import('./components/settings/TeamSettings').then(m => ({ default: m.TeamSettings })));
const HomeInboxView = lazy(() => import('./components/home/HomeInboxView').then(m => ({ default: m.HomeInboxView })));
const ProjectsView = lazy(() => import('./components/projects/ProjectsView').then(m => ({ default: m.ProjectsView })));
const RoadmapView = lazy(() => import('./components/roadmap/RoadmapView').then(m => ({ default: m.RoadmapView })));
const BacklogView = lazy(() => import('./components/sprints/BacklogView').then(m => ({ default: m.BacklogView })));
const SprintBoardView = lazy(() => import('./components/sprints/SprintBoard').then(m => ({ default: m.SprintBoardView })));
const SprintStandupView = lazy(() => import('./components/sprints/SprintBoard').then(m => ({ default: m.SprintStandupView })));
const DocsView = lazy(() => import('./components/docs/DocsView').then(m => ({ default: m.DocsView })));
const DocPane = lazy(() => import('./components/docs/DocPane').then(m => ({ default: m.DocPane })));
const WhiteboardsView = lazy(() => import('./components/docs/board/WhiteboardsView').then(m => ({ default: m.WhiteboardsView })));
const SprintsView = lazy(() => import('./components/sprints/SprintsView').then(m => ({ default: m.SprintsView })));
const SprintDetail = lazy(() => import('./components/sprints/SprintDetail').then(m => ({ default: m.SprintDetail })));
import { MobileNav } from './components/layout/MobileNav';

/**
 * Mounts a lazily-loaded panel the first time it is opened, then keeps it mounted so its
 * state (a half-written ticket) and close animation survive. Until then its code is not
 * even downloaded.
 */
const OnceOpened: React.FC<{ open: boolean; children: React.ReactNode }> = ({ open, children }) => {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened ? <Suspense fallback={null}>{children}</Suspense> : null;
};

/**
 * Shareable ticket link: /:workspaceSlug/tickets/:identifier (e.g. /acme/tickets/XXX-DEV-01).
 * Shows the ticket list with that ticket's panel open. Unknown or inaccessible tickets fall
 * back to the plain list. Used by links from other apps (comm).
 */
const TicketLink: React.FC = () => {
  const { workspaceSlug, identifier } = useParams<{ workspaceSlug: string; identifier: string }>();
  const { currentWorkspace, setSelectedTicket } = useApp();
  const navigate = useNavigate();
  // Wait until the workspace from the URL is the current one (it can briefly be the default).
  const wsId = currentWorkspace && currentWorkspace.slug.toLowerCase() === workspaceSlug?.toLowerCase() ? currentWorkspace.id : null;
  useEffect(() => {
    if (!wsId || !identifier) return;
    let alive = true;
    // Loaded on demand so the entry bundle stays just the shell.
    import('./hooks/useSprints').then((m) => m.fetchTicketByIdentifier(wsId, identifier)).then(
      (t) => { if (!alive) return; if (t) setSelectedTicket(t); else navigate(`/${workspaceSlug}/tickets`, { replace: true }); },
      () => { if (alive) navigate(`/${workspaceSlug}/tickets`, { replace: true }); },
    );
    return () => { alive = false; };
  }, [wsId, identifier, workspaceSlug, setSelectedTicket, navigate]);
  return <TicketListView onlyMine={false} />;
};

const MainLayout: React.FC = () => {
/**
 * Pre-004 the ticket routes said "issues". Bookmarks and already-shared links still do,
 * so map them onto the new paths instead of 404ing. The filter query string
 * (?view=&status=&mine=&team=) is carried across unchanged.
 */
const LegacyIssueRedirect: React.FC<{ scope?: 'mine' | 'team' }> = ({ scope }) => {
  const { workspaceSlug, teamId } = useParams<{ workspaceSlug: string; teamId: string }>();
  const { search } = useLocation();
  const path =
    scope === 'team' ? `/${workspaceSlug}/teams/${teamId}/tickets`
    : scope === 'mine' ? `/${workspaceSlug}/my-tickets`
    : `/${workspaceSlug}/tickets`;
  return <Navigate to={path + search} replace />;
};

  const {
    isNotificationOpen, setIsNotificationOpen, isSidebarCollapsed, isNewTicketModalOpen,
    selectedTicket, isNewTestCaseModalOpen, isSearchModalOpen, isShortcutsModalOpen,
    setSelectedTicket, setIsNewTestCaseModalOpen, setIsSearchModalOpen, setIsShortcutsModalOpen,
  } = useApp();

  // The ticket and test-case panels cover the whole content area and live outside the
  // routes, so without this a sidebar click changed the page underneath an open ticket
  // and looked like it did nothing. Moving to a different page closes them. Only the
  // pathname counts: filter and ?query changes on the same page leave them open, and
  // nothing opens a ticket and navigates in the same step.
  const { pathname } = useLocation();
  const isDocsRoute = /\/docs(\/|$)/.test(pathname);
  const lastPathRef = useRef(pathname);
  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    setSelectedTicket(null);
    setIsNewTestCaseModalOpen(false);
    // Keyboard shortcuts ("g" then a letter) can change page with these still open.
    setIsSearchModalOpen(false);
    setIsShortcutsModalOpen(false);
  }, [pathname, setSelectedTicket, setIsNewTestCaseModalOpen, setIsSearchModalOpen, setIsShortcutsModalOpen]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary font-sans antialiased">
      {/* Left Sidebar (Desktop persistent + Mobile slide-over drawer) */}
      <Sidebar />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-surface rounded-none md:rounded-lg m-0 md:my-3 shadow-none md:shadow-sm ${
        // Docs draws its own two cards (list and document) at lg+, so this one steps back.
        isDocsRoute ? 'lg:bg-transparent lg:shadow-none lg:rounded-none' : ''
      } relative pb-14 lg:pb-0 transition-[margin] duration-200 ease-out ${isSidebarCollapsed ? 'md:ml-3' : 'md:ml-1.5'} ${isNotificationOpen || isNewTicketModalOpen ? 'md:mr-1.5' : 'md:mr-3'}`}>
        <Header />

        <main className="flex-1 flex min-w-0 overflow-hidden relative">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center text-text-tertiary text-xs">Loading…</div>
          }>
          <Routes>
            <Route path="/:workspaceSlug">
              <Route index element={<HomeInboxView />} />
              <Route path="my-tickets" element={<TicketListView onlyMine={true} />} />
              <Route path="projects" element={<ProjectsView />} />
              <Route path="roadmap" element={<RoadmapView />} />
              <Route path="sprints" element={<SprintsView />} />
              <Route path="sprints/:sprintId" element={<SprintDetail />} />
              <Route path="sprints/:sprintId/board" element={<SprintBoardView />} />
              <Route path="sprints/:sprintId/standup" element={<SprintStandupView />} />
              <Route path="tickets" element={<TicketListView onlyMine={false} />} />
              <Route path="tickets/:identifier" element={<TicketLink />} />
              <Route path="issues" element={<LegacyIssueRedirect />} />
              <Route path="my-issues" element={<LegacyIssueRedirect scope="mine" />} />
              <Route path="members" element={
                <div className="flex-1 overflow-y-auto p-6">
                  {/* These pages have no header of their own; the toggle sits where other pages put it. */}
                  <div className="hidden lg:block mb-3"><SidebarToggle /></div>
                  <div>
                    <MemberSettings />
                  </div>
                </div>
              } />
              <Route path="teams" element={
                <div className="flex-1 overflow-y-auto p-6">
                  {/* These pages have no header of their own; the toggle sits where other pages put it. */}
                  <div className="hidden lg:block mb-3"><SidebarToggle /></div>
                  <div>
                    <TeamSettings />
                  </div>
                </div>
              } />
              
              {/* Team specific routes */}
              <Route path="teams/:teamId/projects" element={<ProjectsView />} />
              <Route path="teams/:teamId/tickets" element={<TicketListView onlyMine={false} />} />
              <Route path="teams/:teamId/sprints" element={<SprintsView />} />
              <Route path="teams/:teamId/backlog" element={<BacklogView />} />
              <Route path="teams/:teamId/issues" element={<LegacyIssueRedirect scope="team" />} />
              <Route path="teams/:teamId/members" element={
                <div className="flex-1 overflow-y-auto p-6">
                  {/* These pages have no header of their own; the toggle sits where other pages put it. */}
                  <div className="hidden lg:block mb-3"><SidebarToggle /></div>
                  <div>
                    <TeamSettings />
                  </div>
                </div>
              } />

              <Route path="testcases" element={<TestCaseListView />} />
              {/* Layout route: the tree stays mounted while the open doc changes. */}
              <Route path="docs" element={<DocsView />}>
                <Route path=":docId" element={<DocPane />} />
              </Route>
              {/* Whiteboards are docs underneath, shown in their own section. */}
              <Route path="whiteboards" element={<WhiteboardsView />} />
              <Route path="whiteboards/:docId" element={
                <div className="flex-1 flex min-w-0 overflow-hidden">
                  <DocPane />
                </div>
              } />
              <Route path="settings" element={<SettingsView />} />
              <Route path="dashboard" element={<DashboardView />} />
            </Route>
            <Route path="*" element={<div className="flex items-center justify-center w-full h-full text-text-secondary">Loading workspace...</div>} />
          </Routes>
          </Suspense>
        </main>

        {/* Inline Ticket & TestCase Detail views within the right card container */}
        <OnceOpened open={!!selectedTicket}><TicketDetailModal /></OnceOpened>
        <OnceOpened open={isNewTestCaseModalOpen}><NewTestCaseModal /></OnceOpened>
      </div>

      {/* Right New Ticket Card -- a panel like Notifications, beside the page */}
      <OnceOpened open={isNewTicketModalOpen}><NewTicketModal /></OnceOpened>

      {/* Right Notification Card (Desktop persistent / sliding card + Mobile drawer) */}
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />

      {/* Modals and Drawers */}
      <OnceOpened open={isSearchModalOpen}><GlobalSearchModal /></OnceOpened>
      <OnceOpened open={isShortcutsModalOpen}><KeyboardShortcutsModal /></OnceOpened>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav />
    </div>
  );
};

const checkIsRecovery = () => {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const path = window.location.pathname || '';

  const isRecovery =
    hash.includes('type=recovery') ||
    search.includes('type=recovery') ||
    path.includes('reset-password') ||
    sessionStorage.getItem('supabase_password_recovery') === 'true';

  if (isRecovery) {
    sessionStorage.setItem('supabase_password_recovery', 'true');
  }

  return isRecovery;
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState<boolean>(() => checkIsRecovery());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY' || sessionStorage.getItem('supabase_password_recovery') === 'true') {
        sessionStorage.setItem('supabase_password_recovery', 'true');
        setIsResettingPassword(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isInitializing) {
    return <div className="min-h-screen bg-bg-base flex items-center justify-center font-sans text-text-secondary">Loading...</div>;
  }

  // Handle password recovery flow from email link
  if (isResettingPassword) {
    return (
      <ResetPasswordView
        onComplete={() => {
          sessionStorage.removeItem('supabase_password_recovery');
          setIsResettingPassword(false);
          window.location.hash = '';
          window.history.replaceState(null, '', '/');
        }}
      />
    );
  }

  if (!session) {
    return <LoginView />;
  }

  return (
    <Router>
      <AppProvider session={session}>
        <MainLayout />
      </AppProvider>
    </Router>
  );
}

export default App;
