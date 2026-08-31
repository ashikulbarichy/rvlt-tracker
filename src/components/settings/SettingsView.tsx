import React, { useState } from 'react';
import { User, Building, Users, Users2 } from 'lucide-react';
import { ProfileSettings } from './ProfileSettings';
import { WorkspaceSettings } from './WorkspaceSettings';
import { MemberSettings } from './MemberSettings';
import { TeamSettings } from './TeamSettings';

export const SettingsView: React.FC = () => {
  const [activeSettingsTab, setActiveSettingsTab] = useState<'profile' | 'workspace' | 'members' | 'teams'>('profile');

  const tabs = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'workspace', label: 'Workspace', icon: Building },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'teams', label: 'Teams', icon: Users2 },
  ];

  return (
    <div className="flex-1 flex bg-transparent h-full overflow-hidden font-sans">
      
      {/* Settings Navigation Sidebar */}
      <div className="w-[180px] bg-transparent border-r border-border shrink-0 p-4">
        <h1 className="text-base font-karla font-semibold text-text-primary mb-4">Settings</h1>
        <nav className="space-y-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSettingsTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSettingsTab(tab.id as any)}
                className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs transition-colors ${
                  isActive
                    ? 'bg-bg-surface text-text-primary font-medium'
                    : 'text-text-secondary hover:bg-bg-surface/50 hover:text-text-primary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Settings Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl">
          {activeSettingsTab === 'profile' && <ProfileSettings />}
          {activeSettingsTab === 'workspace' && <WorkspaceSettings />}
          {activeSettingsTab === 'members' && <MemberSettings />}
          {activeSettingsTab === 'teams' && <TeamSettings />}
        </div>
      </div>
      
    </div>
  );
};
