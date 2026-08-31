import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { IssueListView } from './components/issues/IssueListView';
import { IssueDetailModal } from './components/issues/IssueDetailModal';
import { NewIssueModal } from './components/issues/NewIssueModal';
import { TestCaseListView } from './components/testcases/TestCaseListView';
import { NewTestCaseModal } from './components/testcases/NewTestCaseModal';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';
import { DashboardView } from './components/dashboard/DashboardView';
import { LoginView } from './components/auth/LoginView';
import { SignupView } from './components/auth/SignupView';
import { SettingsView } from './components/settings/SettingsView';
import { MemberSettings } from './components/settings/MemberSettings';
import { TeamSettings } from './components/settings/TeamSettings';
import { DocsView } from './components/docs/DocsView';
import { HomeInboxView } from './components/home/HomeInboxView';
import { ProjectsView } from './components/projects/ProjectsView';

const MainLayout: React.FC = () => {
  const { isNotificationOpen, setIsNotificationOpen } = useApp();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary font-sans antialiased">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-surface border border-border rounded-[12px] my-3 mr-3 ml-1.5 shadow-sm relative">
        <Header />

        <main className="flex-1 flex min-w-0 overflow-hidden relative">
          <Routes>
            <Route path="/:workspaceSlug">
              <Route index element={<HomeInboxView />} />
              <Route path="my-issues" element={<IssueListView onlyMine={true} />} />
              <Route path="projects" element={<ProjectsView />} />
              <Route path="issues" element={<IssueListView onlyMine={false} />} />
              <Route path="members" element={
                <div className="flex-1 overflow-y-auto p-6 bg-bg-base">
                  <div className="max-w-4xl mx-auto">
                    <MemberSettings />
                  </div>
                </div>
              } />
              <Route path="teams" element={
                <div className="flex-1 overflow-y-auto p-6 bg-bg-base">
                  <div className="max-w-4xl mx-auto">
                    <TeamSettings />
                  </div>
                </div>
              } />
              
              {/* Team specific routes */}
              <Route path="teams/:teamId/projects" element={<ProjectsView />} />
              <Route path="teams/:teamId/issues" element={<IssueListView onlyMine={false} />} />
              <Route path="teams/:teamId/members" element={
                <div className="flex-1 overflow-y-auto p-6 bg-bg-base">
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

      {/* Modals and Drawers */}
      <NewIssueModal />
      <GlobalSearchModal />
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />
    </div>
  );
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isInitializing) {
    return <div className="min-h-screen bg-bg-base flex items-center justify-center font-sans text-text-secondary">Loading...</div>;
  }

  if (!session) {
    return authView === 'login' ? (
      <LoginView onSwitchToSignup={() => setAuthView('signup')} />
    ) : (
      <SignupView onSwitchToLogin={() => setAuthView('login')} />
    );
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
