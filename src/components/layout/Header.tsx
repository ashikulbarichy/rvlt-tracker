import React from 'react';
import { Search, Menu } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Mobile-only top bar. On desktop the sidebar toggle lives beside page titles
 * (SidebarToggle) and profile/notifications live at the bottom of the sidebar.
 */
export const Header: React.FC = () => {
  const {
    toggleMobileSidebar,
    setIsSearchModalOpen,
    currentWorkspace,
  } = useApp();

  return (
    <header className="lg:hidden h-14 px-3 sm:px-6 flex items-center justify-between shrink-0 bg-transparent border-b border-border/50">
      <div className="flex items-center space-x-2 sm:space-x-2.5">
        {/* Mobile Hamburger Button */}
        <button
          onClick={toggleMobileSidebar}
          className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover rounded-full transition-colors"
          title="Open menu"
          aria-label="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Mobile Workspace / Brand indicator */}
        <div className="flex items-center space-x-2">
          <img src="/favicon.svg" alt="Logo" className="w-5 h-5 rounded-sm" />
          <span className="font-karla font-semibold text-sm text-text-primary truncate max-w-[140px] sm:max-w-[200px]">
            {currentWorkspace?.name || 'Track'}
          </span>
        </div>
      </div>

      {/* Mobile Search */}
      <button
        onClick={() => setIsSearchModalOpen(true)}
        className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover rounded-full transition-colors"
        title="Search"
        aria-label="Search"
      >
        <Search className="w-4 h-4" />
      </button>
    </header>
  );
};
