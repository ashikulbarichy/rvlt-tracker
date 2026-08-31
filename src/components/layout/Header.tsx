import React from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';

export const Header: React.FC = () => {
  const { currentUser, toggleNotifications, setIsSearchModalOpen, toggleMobileSidebar, currentWorkspace } = useApp();
  const { notifications } = useNotifications();

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  return (
    <header className="h-14 px-3 sm:px-6 flex items-center justify-between shrink-0 bg-transparent border-b border-border/50 lg:border-none">
      {/* Left: Mobile Hamburger & Search */}
      <div className="flex items-center space-x-2">
        <button
          onClick={toggleMobileSidebar}
          className="lg:hidden p-2 text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover rounded-md transition-colors"
          title="Open menu"
          aria-label="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Mobile Workspace / Brand indicator */}
        <div className="flex items-center space-x-2 lg:hidden">
          <img src="/favicon.svg" alt="Logo" className="w-5 h-5 rounded" />
          <span className="font-karla font-semibold text-sm text-text-primary truncate max-w-[140px] sm:max-w-[200px]">
            {currentWorkspace?.name || 'Track'}
          </span>
        </div>

        {/* Global Search Button */}
        <button 
          onClick={() => setIsSearchModalOpen(true)}
          className="hidden sm:flex items-center space-x-2 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-bg-surface hover:bg-bg-surface-hover rounded-md transition-colors border border-border hover:border-border-strong"
          title="Search (⌘K)"
        >
          <Search className="w-3.5 h-3.5 text-text-secondary" />
          <span className="text-text-secondary">Search...</span>
          <kbd className="hidden md:inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 bg-bg-surface-raised border border-border rounded text-text-tertiary">⌘K</kbd>
        </button>

        <button 
          onClick={() => setIsSearchModalOpen(true)}
          className="sm:hidden p-2 text-text-secondary hover:text-text-primary hover:bg-bg-surface rounded-md transition-colors"
          title="Search"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Notifications & User Profile Display */}
      <div className="flex items-center space-x-1.5 sm:space-x-2.5">
        <button
          onClick={toggleNotifications}
          className="relative p-2 text-text-secondary hover:text-text-primary hover:bg-bg-surface rounded-md transition-colors"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[15px] h-3.5 px-1 bg-accent-primary text-bg-base text-[9px] font-semibold flex items-center justify-center rounded-full leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        <div className="flex items-center space-x-2 px-1 sm:px-2 py-1 select-none">
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-border">
            <img
              src={currentUser?.avatar_url || 'https://i.pravatar.cc/150?u=a042581f4e29026704d'}
              alt={currentUser?.full_name || 'User'}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="hidden sm:inline text-xs font-medium text-text-primary truncate max-w-[120px]">
            {currentUser?.full_name || 'User'}
          </span>
        </div>
      </div>
    </header>
  );
};
