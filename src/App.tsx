import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { KeyboardShortcutsModal } from './components/layout/KeyboardShortcutsModal';
import { TicketListView } from './components/tickets/TicketListView';
import { TicketDetailModal } from './components/tickets/TicketDetailModal';
import { NewTicketModal } from './components/tickets/NewTicketModal';
import { TestCaseListView } from './components/testcases/TestCaseListView';
import { NewTestCaseModal } from './components/testcases/NewTestCaseModal';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';
import { DashboardView } from './components/dashboard/DashboardView';
import { LoginView } from './components/auth/LoginView';
import { ResetPasswordView } from './components/auth/ResetPasswordView';
import { SettingsView } from './components/settings/SettingsView';
import { MemberSettings } from './components/settings/MemberSettings';
import { TeamSettings } from './components/settings/TeamSettings';
const DocsView = lazy(() => import('./components/docs/DocsView').then(m => ({ default: m.DocsView })));
const DocPane = lazy(() => import('./components/docs/DocPane').then(m => ({ default: m.DocPane })));
const SprintsView = lazy(() => import('./components/sprints/SprintsView').then(m => ({ default: m.SprintsView })));
const SprintDetail = lazy(() => import('./components/sprints/SprintDetail').then(m => ({ default: m.SprintDetail })));
import { HomeInboxView } from './components/home/HomeInboxView';
import { ProjectsView } from './components/projects/ProjectsView';
import { RoadmapView } from './components/roadmap/RoadmapView';
import { MobileNav } from './components/layout/MobileNav';

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

  const { isNotificationOpen, setIsNotificationOpen, isSidebarCollapsed } = useApp();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary font-sans antialiased">
      {/* Left Sidebar (Desktop persistent + Mobile slide-over drawer) */}
      <Sidebar />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-surface rounded-none md:rounded-lg m-0 md:my-3 shadow-none md:shadow-sm relative pb-14 lg:pb-0 transition-[margin] duration-200 ease-out ${isSidebarCollapsed ? 'md:ml-3' : 'md:ml-1.5'} ${isNotificationOpen ? 'md:mr-1.5' : 'md:mr-3'}`}>
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
              <Route path="tickets" element={<TicketListView onlyMine={false} />} />
              <Route path="issues" element={<LegacyIssueRedirect />} />
              <Route path="my-issues" element={<LegacyIssueRedirect scope="mine" />} />
              <Route path="members" element={
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="max-w-4xl mx-auto">
                    <MemberSettings />
                  </div>
                </div>
              } />
              <Route path="teams" element={
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="max-w-4xl mx-auto">
                    <TeamSettings />
                  </div>
                </div>
              } />
              
              {/* Team specific routes */}
              <Route path="teams/:teamId/projects" element={<ProjectsView />} />
              <Route path="teams/:teamId/tickets" element={<TicketListView onlyMine={false} />} />
              <Route path="teams/:teamId/sprints" element={<SprintsView />} />
              <Route path="teams/:teamId/issues" element={<LegacyIssueRedirect scope="team" />} />
              <Route path="teams/:teamId/members" element={
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="max-w-4xl mx-auto">
                    <TeamSettings />
                  </div>
                </div>
              } />

              <Route path="testcases" element={<TestCaseListView />} />
              {/* Layout route: the tree stays mounted while the open doc changes. */}
              <Route path="docs" element={<DocsView />}>
                <Route path=":docId" element={<DocPane />} />
              </Route>
              <Route path="settings" element={<SettingsView />} />
              <Route path="dashboard" element={<DashboardView />} />
            </Route>
            <Route path="*" element={<div className="flex items-center justify-center w-full h-full text-text-secondary">Loading workspace...</div>} />
          </Routes>
          </Suspense>
        </main>

        {/* Inline Ticket & TestCase Detail views within the right card container */}
        <TicketDetailModal />
        <NewTestCaseModal />
      </div>

      {/* Right Notification Card (Desktop persistent / sliding card + Mobile drawer) */}
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />

      {/* Modals and Drawers */}
      <NewTicketModal />
      <GlobalSearchModal />
      <KeyboardShortcutsModal />

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
