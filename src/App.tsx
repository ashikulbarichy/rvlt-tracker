import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { KeyboardShortcutsModal } from './components/layout/KeyboardShortcutsModal';
import { IssueListView } from './components/issues/IssueListView';
import { IssueDetailModal } from './components/issues/IssueDetailModal';
import { NewIssueModal } from './components/issues/NewIssueModal';
import { TestCaseListView } from './components/testcases/TestCaseListView';
import { NewTestCaseModal } from './components/testcases/NewTestCaseModal';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';
import { DashboardView } from './components/dashboard/DashboardView';
import { LoginView } from './components/auth/LoginView';
import { ResetPasswordView } from './components/auth/ResetPasswordView';
import { SettingsView } from './components/settings/SettingsView';
import { MemberSettings } from './components/settings/MemberSettings';
import { TeamSettings } from './components/settings/TeamSettings';
import { DocsView } from './components/docs/DocsView';
import { HomeInboxView } from './components/home/HomeInboxView';
import { ProjectsView } from './components/projects/ProjectsView';
import { MobileNav } from './components/layout/MobileNav';

const MainLayout: React.FC = () => {
  const { isNotificationOpen, setIsNotificationOpen, isSidebarCollapsed } = useApp();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary font-sans antialiased">
      {/* Left Sidebar (Desktop persistent + Mobile slide-over drawer) */}
      <Sidebar />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-surface rounded-none md:rounded-lg m-0 md:my-3 shadow-none md:shadow-sm relative pb-14 lg:pb-0 transition-[margin] duration-200 ease-out ${isSidebarCollapsed ? 'md:ml-3' : 'md:ml-1.5'} ${isNotificationOpen ? 'md:mr-1.5' : 'md:mr-3'}`}>
        <Header />

        <main className="flex-1 flex min-w-0 overflow-hidden relative">
          <Routes>
            <Route path="/:workspaceSlug">
              <Route index element={<HomeInboxView />} />
              <Route path="my-issues" element={<IssueListView onlyMine={true} />} />
              <Route path="projects" element={<ProjectsView />} />
              <Route path="issues" element={<IssueListView onlyMine={false} />} />
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
              <Route path="teams/:teamId/issues" element={<IssueListView onlyMine={false} />} />
              <Route path="teams/:teamId/members" element={
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="max-w-4xl mx-auto">
                    <TeamSettings />
                  </div>
                </div>
              } />

              <Route path="testcases" element={<TestCaseListView />} />
              <Route path="docs" element={<DocsView />} />
              <Route path="settings" element={<SettingsView />} />
              <Route path="dashboard" element={<DashboardView />} />
            </Route>
            <Route path="*" element={<div className="flex items-center justify-center w-full h-full text-text-secondary">Loading workspace...</div>} />
          </Routes>
        </main>

        {/* Inline Issue & TestCase Detail views within the right card container */}
        <IssueDetailModal />
        <NewTestCaseModal />
      </div>

      {/* Right Notification Card (Desktop persistent / sliding card + Mobile drawer) */}
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />

      {/* Modals and Drawers */}
      <NewIssueModal />
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
