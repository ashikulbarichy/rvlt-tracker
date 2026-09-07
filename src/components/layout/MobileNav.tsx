import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Inbox, UserCheck, FolderKanban, Plus, Menu, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const MobileNav: React.FC = () => {
  const { currentWorkspace, setIsNewIssueModalOpen, toggleMobileSidebar, setIsSearchModalOpen } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const wsSlug = currentWorkspace?.slug || '';

  const isHome = path === `/${wsSlug}` || path === `/${wsSlug}/`;
  const isMyIssues = path.endsWith('/my-issues');
  const isProjects = path.endsWith('/projects');
  const isIssues = path.endsWith('/issues');

  return (
    <nav 
      aria-label="Mobile navigation" 
      className="fixed bottom-0 left-0 right-0 z-40 bg-black/90 backdrop-blur-md flex items-center justify-around px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden shadow-lg select-none"
    >
      {/* Home / Inbox */}
      <button
        onClick={() => navigate(`/${wsSlug}`)}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-md transition-colors min-w-[52px] ${
          isHome ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        <Inbox className="w-4 h-4 mb-0.5" />
        <span className="text-[10px] font-medium tracking-tight">Inbox</span>
      </button>

      {/* Issues */}
      <button
        onClick={() => navigate(`/${wsSlug}/issues`)}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-md transition-colors min-w-[52px] ${
          isIssues ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        <UserCheck className="w-4 h-4 mb-0.5" />
        <span className="text-[10px] font-medium tracking-tight">Issues</span>
      </button>

      {/* New Issue Quick Action */}
      <button
        onClick={() => setIsNewIssueModalOpen(true)}
        className="flex items-center justify-center w-10 h-10 -mt-3 rounded-full bg-accent-primary text-button-text shadow-md hover:bg-accent-primary-hover active:scale-95 transition-transform shrink-0"
        title="New Issue"
        aria-label="Create new issue"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>

      {/* Projects */}
      <button
        onClick={() => navigate(`/${wsSlug}/projects`)}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-md transition-colors min-w-[52px] ${
          isProjects ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        <FolderKanban className="w-4 h-4 mb-0.5" />
        <span className="text-[10px] font-medium tracking-tight">Projects</span>
      </button>

      {/* Menu / Sidebar Drawer */}
      <button
        onClick={toggleMobileSidebar}
        className="flex flex-col items-center justify-center py-1 px-2.5 rounded-md text-text-secondary hover:text-text-primary transition-colors min-w-[52px]"
        title="Open navigation menu"
        aria-label="Open navigation menu"
      >
        <Menu className="w-4 h-4 mb-0.5" />
        <span className="text-[10px] font-medium tracking-tight">Menu</span>
      </button>
    </nav>
  );
};
