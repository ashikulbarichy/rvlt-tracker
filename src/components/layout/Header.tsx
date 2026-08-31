import React from 'react';
import { Search, Bell } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';

export const Header: React.FC = () => {
  const { currentUser, toggleNotifications, setIsSearchModalOpen } = useApp();
  const { notifications } = useNotifications();

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  return (
    <header className="h-14 px-6 flex items-center justify-between shrink-0 bg-transparent">
      {/* Left: Global Search Icon */}
      <button 
        onClick={() => setIsSearchModalOpen(true)}
        className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-surface rounded-md transition-colors"
        title="Search"
      >
        <Search className="w-4 h-4" />
      </button>

      {/* Right: Notifications & User Profile Display */}
      <div className="flex items-center space-x-2.5">
        <button
          onClick={toggleNotifications}
          className="relative p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-surface rounded-md transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[15px] h-3.5 px-1 bg-accent-primary text-bg-base text-[9px] font-semibold flex items-center justify-center rounded-full leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        <div className="flex items-center space-x-2.5 px-2 py-1 select-none">
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0">
            <img
              src={currentUser?.avatar_url || 'https://i.pravatar.cc/150?u=a042581f4e29026704d'}
              alt={currentUser?.full_name || 'User'}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-sm font-medium text-text-primary">
            {currentUser?.full_name || 'User'}
          </span>
        </div>
      </div>
    </header>
  );
};
