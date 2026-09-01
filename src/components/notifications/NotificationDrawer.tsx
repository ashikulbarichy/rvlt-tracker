import React, { useState } from 'react';
import {
  X,
  Bell,
  CheckCheck,
  MessageSquare,
  UserCheck,
  AlertCircle,
  Users
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import { useIssues } from '../../hooks/useIssues';
import { useWorkspaceMembers } from '../../hooks/useWorkspaceMembers';
import { supabase } from '../../lib/supabase';
import { formatRelativeTime } from '../../lib/time';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose }) => {
  const { setSelectedIssue, currentWorkspace, setCurrentWorkspace } = useApp();
  const { notifications, markAsRead, markAllAsRead } = useNotifications();
  const { issues } = useIssues({ workspaceId: currentWorkspace?.id });
  const { acceptInvitation, declineInvitation } = useWorkspaceMembers();

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  const handleAcceptInvite = async (notif: any) => {
    setActionLoading(notif.id);
    try {
      await acceptInvitation(notif.entity_id);
      markAsRead(notif.id);
      try {
        const { data: wsData } = await supabase.from('workspaces').select('*').eq('id', notif.entity_id).single();
        if (wsData) {
          setCurrentWorkspace(wsData);
        }
      } catch (wsErr) {
        console.warn('Workspace switch note:', wsErr);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to accept invitation:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineInvite = async (notif: any) => {
    setActionLoading(notif.id);
    try {
      await declineInvitation(notif.entity_id);
      markAsRead(notif.id);
    } catch (err: any) {
      console.error('Failed to decline invitation:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleNotificationClick = (notif: any) => {
    if (notif.type === 'workspace_invite' || notif.entity_type === 'workspace_invitation') {
      return;
    }
    markAsRead(notif.id);
    if (notif.entity_type === 'issue' && issues) {
      const targetIssue = issues.find(i => i.id === notif.entity_id);
      if (targetIssue) {
        setSelectedIssue(targetIssue);
        onClose();
      }
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Right Notification Card — matching Sidebar appearance & animation */}
      <aside
        className={`bg-bg-surface border-border flex flex-col select-none shrink-0 font-sans z-50 lg:z-20 transition-[width,margin,padding,border-color] duration-200 ease-out overflow-hidden shadow-2xl lg:shadow-sm
          fixed inset-y-0 right-0 h-full border-l border-y-0 border-r-0 rounded-none
          lg:static lg:h-[calc(100vh-24px)] lg:rounded-[12px]
          ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          ${
            !isOpen
              ? 'lg:w-0 lg:my-3 lg:ml-0 lg:mr-0 lg:p-0 lg:border-0 pointer-events-none'
              : 'w-[300px] lg:w-[300px] xl:w-[320px] lg:my-3 lg:mr-3 lg:ml-1.5 lg:border'
          }
        `}
      >
        {/* Sliding Contents Wrapper */}
        <div className={`flex flex-col h-full w-[300px] lg:w-[300px] xl:w-[320px] shrink-0 transition-transform duration-200 ease-out ${!isOpen ? 'lg:translate-x-full' : 'translate-x-0'}`}>
          {/* Header */}
          <div className="h-14 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="p-1.5 rounded-md bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <span className="font-medium text-sm sm:text-base text-text-primary tracking-wide leading-tight truncate">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-accent-primary text-bg-base font-id text-[10px] font-bold shrink-0 leading-tight">
                  {unreadCount}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1 shrink-0">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-[11px] text-text-secondary hover:text-text-primary flex items-center space-x-1 px-2 py-1 rounded-md hover:bg-bg-surface-hover transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mark read</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors"
                title="Close notifications"
                aria-label="Close notifications"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {(!notifications || notifications.length === 0) ? (
              <div className="p-8 text-center flex flex-col items-center justify-center h-full text-text-tertiary">
                <div className="w-10 h-10 rounded-full bg-bg-surface-raised flex items-center justify-center mb-3">
                  <Bell className="w-5 h-5 opacity-40" />
                </div>
                <p className="text-xs font-medium text-text-secondary">All caught up</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">No notifications right now</p>
              </div>
            ) : (
              notifications.map((notif: any) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 cursor-pointer transition-colors ${
                    notif.is_read ? 'bg-transparent hover:bg-bg-surface-hover opacity-70' : 'bg-accent-primary/5 hover:bg-bg-surface-hover'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="mt-0.5 shrink-0">
                      {notif.type === 'assignment' && <UserCheck className="w-4 h-4 text-accent-primary" />}
                      {notif.type === 'comment' && <MessageSquare className="w-4 h-4 text-accent-secondary" />}
                      {notif.type === 'status_change' && <AlertCircle className="w-4 h-4 text-status-warning" />}
                      {(notif.type === 'mention' || notif.type === 'workspace_invite') && <Users className="w-4 h-4 text-accent-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text-primary font-medium mb-0.5">
                        {notif.title}
                      </div>
                      <div className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed">
                        {notif.message}
                      </div>

                      {/* Accept / Decline actions for workspace invitations */}
                      {(notif.type === 'workspace_invite' || notif.entity_type === 'workspace_invitation') && (
                        <div className="flex items-center space-x-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAcceptInvite(notif);
                            }}
                            disabled={actionLoading === notif.id}
                            className="px-2.5 py-1 text-[11px] font-medium text-bg-base bg-accent-primary hover:bg-accent-primary-hover rounded transition-colors disabled:opacity-50"
                          >
                            {actionLoading === notif.id ? 'Joining...' : 'Accept'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeclineInvite(notif);
                            }}
                            disabled={actionLoading === notif.id}
                            className="px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface border border-border rounded transition-colors disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}

                      <div className="text-[10px] text-text-tertiary mt-1.5 font-id">
                        {formatRelativeTime(notif.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
