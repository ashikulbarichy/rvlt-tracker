import React from 'react';
import { useApp } from '../../context/AppContext';
import { SidebarToggle } from '../../components/layout/SidebarToggle';
import { useIssues } from '../../hooks/useIssues';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Inbox
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { currentWorkspace, currentUser } = useApp();

  // Metric 1: My Open Issues (assigned to me, not closed)
  // Our hook currently fetches all and we can filter on the client, or we could pass assigneeId.
  // To be performant, we pass assigneeId.
  const { totalCount: myOpenCount, issues: myRecentIssues, isLoading: isLoadingMine } = useIssues({
    workspaceId: currentWorkspace?.id,
    assigneeId: currentUser?.id,
    page: 1,
    limit: 5 // Get recent 5 for the list
  });

  // Metric 2: Workspace Total Issues (just to show scale)
  const { totalCount: totalWorkspaceCount } = useIssues({
    workspaceId: currentWorkspace?.id,
    page: 1,
    limit: 1 // We only need the count
  });

  // Since our hook doesn't support complex 'NOT IN (closed_status)' directly via params right now, 
  // we filter the small subset returned for the UI list.
  const activeIssues = myRecentIssues.filter(issue => 
    issue.status?.category !== 'completed' && issue.status?.category !== 'canceled'
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getPriorityInfo = (priority: string) => {
    switch (priority) {
      case 'urgent': return { color: 'bg-status-error', label: 'Urgent' };
      case 'high': return { color: 'bg-status-warning', label: 'High' };
      case 'medium': return { color: 'bg-status-attention', label: 'Med' };
      case 'low': return { color: 'bg-status-info', label: 'Low' };
      default: return { color: 'bg-bg-surface-raised border border-transparent', label: 'None' };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-y-auto px-3 sm:px-6 py-3.5 sm:py-5 font-sans">
      
      {/* Header section */}
      <div className="mb-4 sm:mb-6">
        <h1 className="flex items-center gap-2.5 text-xl sm:text-2xl font-karla font-bold tracking-tight text-text-primary mb-0.5 sm:mb-1">
            <SidebarToggle />
          {getGreeting()}, {currentUser?.full_name?.split(' ')[0] || 'there'}.
        </h1>
        <p className="text-text-secondary text-xs sm:text-sm">
          Here is what's happening in <span className="font-medium text-text-primary">{currentWorkspace?.name}</span> today.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-3.5 mb-5 sm:mb-6">
        {/* Card 1 */}
        <div className="bg-bg-surface p-3.5 rounded-md border border-transparent flex flex-col shadow-sm">
          <div className="flex items-center space-x-1.5 text-text-secondary mb-2">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">My Workload</span>
          </div>
          <div className="text-xl font-karla font-bold text-text-primary mb-0.5">
            {isLoadingMine ? '-' : myOpenCount}
          </div>
          <div className="text-[11px] text-text-tertiary">
            Total issues assigned to you
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-bg-surface p-3.5 rounded-md border border-transparent flex flex-col shadow-sm">
          <div className="flex items-center space-x-1.5 text-text-secondary mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Workspace Volume</span>
          </div>
          <div className="text-xl font-karla font-bold text-text-primary mb-0.5">
            {totalWorkspaceCount || '-'}
          </div>
          <div className="text-[11px] text-text-tertiary">
            Total issues logged in this workspace
          </div>
        </div>

        {/* Card 3 (Placeholder for Velocity/Completed) */}
        <div className="bg-bg-surface p-3.5 rounded-md border border-transparent flex flex-col shadow-sm">
          <div className="flex items-center space-x-1.5 text-text-secondary mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Weekly Velocity</span>
          </div>
          <div className="text-xl font-karla font-bold text-text-primary mb-0.5">
            12
          </div>
          <div className="text-[11px] text-text-tertiary">
            Issues resolved by the team this week
          </div>
        </div>
      </div>

      {/* Main Content Area - Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Column: My Active Issues */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">My Active Issues</h2>
            <button className="text-[11px] font-medium text-accent-primary hover:text-accent-primary-hover transition-colors">
              View all
            </button>
          </div>
          
          <div className="bg-bg-surface-raised border border-transparent rounded-md shadow-sm overflow-hidden">
            {isLoadingMine ? (
              <div className="p-6 text-center text-xs text-text-secondary">Loading your issues...</div>
            ) : activeIssues.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center">
                <Inbox className="w-6 h-6 text-text-tertiary mb-2" />
                <p className="text-xs font-medium text-text-primary mb-0.5">You're all caught up!</p>
                <p className="text-[11px] text-text-secondary">No active issues are assigned to you.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activeIssues.map(issue => {
                  const priorityInfo = getPriorityInfo(issue.priority);
                  return (
                    <div key={issue.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-bg-surface/30 transition-colors cursor-pointer">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${priorityInfo.color}`} />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-text-primary truncate">
                            {issue.title}
                          </div>
                          <div className="text-[11px] text-text-tertiary mt-0.5 flex items-center space-x-1.5">
                            <span className="font-id bg-bg-surface px-1 py-0.5 rounded-full text-[10px]">{issue.identifier}</span>
                            <span>•</span>
                            <span>{issue.status?.name || 'Open'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        <AlertCircle className="w-3.5 h-3.5 text-text-tertiary" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Recent Activity */}
        <div className="lg:col-span-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-2.5">Recent Activity</h2>
          
          <div className="space-y-4">
            {/* Activity Item */}
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-bg-surface-raised border border-transparent flex flex-col items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-bold text-text-secondary">JD</span>
              </div>
              <div>
                <p className="text-sm text-text-primary">
                  <span className="font-medium">Jane Doe</span> completed <span className="font-sans text-xs">FJ-1040</span>
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">2 hours ago</p>
              </div>
            </div>

            {/* Activity Item */}
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-bg-surface-raised border border-transparent flex flex-col items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-bold text-text-secondary">AS</span>
              </div>
              <div>
                <p className="text-sm text-text-primary">
                  <span className="font-medium">Alex Smith</span> commented on <span className="font-sans text-xs">FJ-1042</span>
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">5 hours ago</p>
              </div>
            </div>

            {/* Activity Item */}
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-bg-surface-raised border border-transparent flex flex-col items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-bold text-text-secondary">EL</span>
              </div>
              <div>
                <p className="text-sm text-text-primary">
                  <span className="font-medium">Emma L.</span> created a new issue <span className="font-id text-xs">FJ-1045</span>
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">1 day ago</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
