import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Sidebar collapse/expand toggle, rendered inline beside page titles.
 * Desktop only — mobile uses the hamburger in the top bar.
 */
export const SidebarToggle: React.FC = () => {
  const { isSidebarCollapsed, toggleSidebar } = useApp();

  return (
    <button
      onClick={toggleSidebar}
      className="hidden lg:inline-flex w-8 h-8 shrink-0 text-text-secondary hover:text-text-primary bg-bg-surface-raised hover:bg-bg-surface-hover rounded-full transition-colors items-center justify-center"
      title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {isSidebarCollapsed ? (
        <PanelLeftOpen className="w-4 h-4" />
      ) : (
        <PanelLeftClose className="w-4 h-4" />
      )}
    </button>
  );
};
