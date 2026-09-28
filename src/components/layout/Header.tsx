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
          <img src="/logo.svg" alt="" aria-hidden="true" className="w-7 h-7 shrink-0" />
          <span className="flex flex-col min-w-0 leading-tight">
            <span className="font-karla font-semibold text-sm tracking-tight text-text-primary leading-none">
              Tasks<span className="sr-only"> by Reevolt</span>
            </span>
            {currentWorkspace?.name && (
              <span className="mt-0.5 font-karla font-medium text-[11px] text-text-secondary truncate max-w-[160px] sm:max-w-[240px]">
                {currentWorkspace.name}
              </span>
            )}
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
