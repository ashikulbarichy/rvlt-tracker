import React, { useState } from 'react';
import {
  X,
  Bell,
  CheckCheck,
  MessageSquare,
  UserCheck,
  AlertCircle,
  Users,
  Check
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import { useIssues } from '../../hooks/useIssues';
import { useWorkspaceMembers } from '../../hooks/useWorkspaceMembers';
import { useWorkspaces } from '../../hooks/useWorkspaces';
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
  const { workspaces } = useWorkspaces();

  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
    <div className={`fixed inset-0 z-50 overflow-hidden bg-text-primary/10 backdrop-blur-[1px] transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className={`w-screen max-w-sm bg-bg-surface border-l border-border shadow-xl flex flex-col transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-accent-primary" />
              <h2 className="text-sm font-semibold text-text-primary">
                Notifications
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => markAllAsRead()}
                className="text-[11px] text-text-secondary hover:text-text-primary flex items-center space-x-1 px-1.5 py-0.5 rounded-sm hover:bg-bg-surface-hover"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {(!notifications || notifications.length === 0) ? (
              <div className="p-8 text-center text-xs text-text-tertiary">
                No notifications right now.
              </div>
            ) : (
              notifications.map((notif: any) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-4 cursor-pointer transition-colors ${
                    notif.is_read ? 'bg-bg-surface hover:bg-bg-surface-hover opacity-70' : 'bg-transparent hover:bg-bg-surface-hover font-medium'
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
                      <div className="text-xs text-text-primary mb-0.5">
                        {notif.title}
                      </div>
                      <div className="text-[11px] text-text-secondary line-clamp-2">
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

                      <div className="text-[10px] text-text-tertiary mt-1">
                        {formatRelativeTime(notif.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
