import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext';
import { useWorkspaceMembers, WorkspaceMemberWithProfile } from '../../hooks/useWorkspaceMembers';
import { useProfiles } from '../../hooks/useProfiles';
import { useTeams } from '../../hooks/useTeams';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import { supabase } from '../../lib/supabase';
import { ShieldAlert, Shield, Trash2, User, Plus, X, Check, Mail, AlertCircle, Users } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { ConfirmModal } from '../common/ConfirmModal';

export const MemberSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentWorkspace, userRole, currentUser } = useApp();
  const { members, isLoading, addMember, updateMemberRole, removeMember } = useWorkspaceMembers(currentWorkspace?.id);
  const { profiles } = useProfiles();
  const { teams } = useTeams(currentWorkspace?.id);
  const { assignMember: assignTeamMember, removeMember: removeTeamMember, getUserTeams } = useTeamMembers(currentWorkspace?.id);
  
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [removingMember, setRemovingMember] = useState<{ userId: string; name: string } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [assigningMember, setAssigningMember] = useState<WorkspaceMemberWithProfile | null>(null);
  const [togglingTeamId, setTogglingTeamId] = useState<string | null>(null);
  const [searchEmail, setSearchEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');
  const [initialTeamId, setInitialTeamId] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);

  const isAdmin = userRole === 'admin' || !currentWorkspace || currentWorkspace?.created_by === currentUser?.id;

  // Exact email validation: requires complete address e.g. name@domain.com
  const trimmedEmail = searchEmail.trim();
  const isFullEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

  // Suggest profile ONLY when full email is typed
  const matchedProfile = isFullEmail
    ? profiles?.find(p => p.email?.trim().toLowerCase() === trimmedEmail.toLowerCase()) || null
    : null;

  const isAlreadyMember = matchedProfile
    ? members?.some(m => m.user_id === matchedProfile.id)
    : false;

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'member') => {
    if (!isAdmin) return;
    setProcessingId(userId);
    setStatusMessage(null);
    updateMemberRole({ userId, role: newRole }, {
      onSuccess: () => {
        setStatusMessage({ type: 'success', text: 'Member role updated successfully.' });
        setTimeout(() => setStatusMessage(null), 4000);
      },
      onError: (err: any) => {
        setStatusMessage({ type: 'error', text: err?.message || 'Failed to update member role.' });
      },
      onSettled: () => setProcessingId(null)
    });
  };

  const handleRemove = (userId: string, name: string) => {
    if (!isAdmin) return;
    if (userId === currentWorkspace?.created_by) {
      setStatusMessage({ type: 'error', text: 'The workspace creator cannot be removed from the workspace.' });
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }
    if (userId === currentUser?.id) {
      setStatusMessage({ type: 'error', text: 'You cannot remove yourself from the workspace.' });
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }

    setRemovingMember({ userId, name });
  };

  const handleConfirmRemove = () => {
    if (!removingMember) return;
    setProcessingId(removingMember.userId);
    setStatusMessage(null);
    removeMember(removingMember.userId, {
      onSuccess: () => {
        setStatusMessage({ type: 'success', text: 'Member removed from workspace.' });
        setRemovingMember(null);
        setTimeout(() => setStatusMessage(null), 4000);
      },
      onError: (err: any) => {
        setStatusMessage({ type: 'error', text: err?.message || 'Failed to remove member.' });
        setRemovingMember(null);
      },
      onSettled: () => setProcessingId(null)
    });
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedProfile || isAlreadyMember || !isAdmin || !currentWorkspace) return;

    setIsAdding(true);
    setStatusMessage(null);

    addMember(
      { userId: matchedProfile.id, role: newMemberRole, email: matchedProfile.email },
      {
        onSuccess: async () => {
          // Send notification to the invited user's portal
          try {
            const { error: notifErr } = await supabase.from('notifications').insert([{
              workspace_id: currentWorkspace.id,
              recipient_id: matchedProfile.id,
              actor_id: currentUser?.id,
              type: 'workspace_invite',
              title: 'Workspace Invitation',
              message: `${currentUser?.full_name || 'An admin'} invited you to join workspace "${currentWorkspace.name}"`,
              entity_type: 'workspace_invitation',
              entity_id: currentWorkspace.id,
              is_read: false
            }]);

            if (notifErr) {
              // Fallback to 'mention' if the custom type constraint is not yet applied
              await supabase.from('notifications').insert([{
                workspace_id: currentWorkspace.id,
                recipient_id: matchedProfile.id,
                actor_id: currentUser?.id,
                type: 'mention',
                title: 'Workspace Invitation',
                message: `${currentUser?.full_name || 'An admin'} invited you to join workspace "${currentWorkspace.name}"`,
                entity_type: 'workspace_invitation',
                entity_id: currentWorkspace.id,
                is_read: false
              }]);
            }
          } catch (notifErr) {
            console.warn('Notification insert fallback note:', notifErr);
          }

          // Immediately invalidate local notifications query
          queryClient.invalidateQueries({ queryKey: ['notifications'] });

          // Also assign to initial team if chosen
          if (initialTeamId) {
            try {
              await assignTeamMember({ teamId: initialTeamId, userId: matchedProfile.id });
            } catch (teamErr) {
              console.warn('Initial team assign error:', teamErr);
            }
          }

          setStatusMessage({
            type: 'success',
            text: `Invitation sent to ${matchedProfile.full_name || matchedProfile.email}. They will have access once they accept the invitation from their notifications.`
          });
          setIsAddModalOpen(false);
          setSearchEmail('');
          setNewMemberRole('member');
          setInitialTeamId('');
          setTimeout(() => setStatusMessage(null), 5000);
        },
        onError: (err: any) => {
          setStatusMessage({ type: 'error', text: err?.message || 'Failed to add member.' });
        },
        onSettled: () => setIsAdding(false)
      }
    );
  };

  return (
    <div className="max-w-3xl font-sans">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-karla font-semibold text-text-primary mb-0.5">Members</h2>
          <p className="text-xs text-text-secondary">Manage who has access to this workspace.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-button-text bg-accent-primary rounded-full hover:bg-accent-primary-hover transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          className={`mb-6 p-3 rounded-md text-xs font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-status-success/15 border-status-success text-text-primary'
              : 'bg-status-error/15 border-status-error text-status-error'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-surface-raised border border-transparent rounded-lg max-w-md w-full p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-karla font-medium text-text-primary">Add Member to Workspace</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-text-tertiary hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Member Email
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    placeholder="e.g. colleague@company.com"
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm bg-bg-surface-raised border border-transparent rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                  />
                  <Mail className="w-4 h-4 text-text-tertiary absolute left-3 top-2.5" />
                </div>
                {!isFullEmail && (
                  <p className="mt-1.5 text-xs text-text-secondary">
                    Type the complete registered email address to locate their profile.
                  </p>
                )}
              </div>

              {/* Profile Suggestion - ONLY visible when full email format is typed */}
              {isFullEmail && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5">
                    User Profile
                  </label>
                  {matchedProfile ? (
                    <div
                      className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                        isAlreadyMember
                          ? 'bg-status-warning/10 border-status-warning/40'
                          : 'bg-status-success/10 border-status-success/50'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-9 h-9 rounded-full overflow-hidden border border-transparent shrink-0">
                          <img
                            src={
                              matchedProfile.avatar_url ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                matchedProfile.full_name || 'User'
                              )}&background=282828&color=B3B3B3&rounded=true`
                            }
                            alt={matchedProfile.full_name || 'User'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-text-primary truncate">
                            {matchedProfile.full_name || 'Named User'}
                          </div>
                          <div className="text-xs text-text-secondary truncate">
                            {matchedProfile.email}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 ml-2">
                        {isAlreadyMember ? (
                          <span className="px-2 py-1 text-[11px] font-medium bg-status-warning/20 text-status-warning rounded-md">
                            Already a member
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-[11px] font-medium bg-status-success/20 text-status-success rounded-md flex items-center space-x-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Matched</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-status-error/10 border border-transparent rounded-lg flex items-start space-x-2.5">
                      <AlertCircle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
                      <div className="text-xs text-text-secondary">
                        No registered user found with <span className="font-mono text-text-primary">{trimmedEmail}</span>. The user must sign up to Reevolt Tasks before they can be added to this workspace.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Workspace Role</label>
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as 'admin' | 'member')}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg-surface-raised border border-transparent rounded-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Team (Optional)</label>
                  <select
                    value={initialTeamId}
                    onChange={(e) => setInitialTeamId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-bg-surface-raised border border-transparent rounded-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                  >
                    <option value="">No Team Assigned</option>
                    {teams?.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.key})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setSearchEmail('');
                    setInitialTeamId('');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-surface rounded-full transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding || !matchedProfile || isAlreadyMember}
                  className="px-3 py-1.5 text-xs font-semibold text-button-text bg-accent-primary rounded-full hover:bg-accent-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isAdding ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Teams Modal */}
      {assigningMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-bg-surface-raised border border-transparent rounded-md max-w-sm w-full p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2.5">
              <div className="min-w-0">
                <h3 className="text-xs font-karla font-semibold text-text-primary">Assign Teams</h3>
                <p className="text-[11px] text-text-secondary truncate">
                  {assigningMember.profile?.full_name || assigningMember.profile?.email}
                </p>
              </div>
              <button
                onClick={() => setAssigningMember(null)}
                className="text-text-tertiary hover:text-text-primary p-1 rounded-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-text-secondary mb-2.5">
              Toggle the teams this member should belong to. Members only view issues and projects in their assigned teams.
            </p>

            <div className="space-y-1.5 max-h-56 overflow-y-auto mb-4">
              {teams?.length === 0 ? (
                <p className="text-xs text-text-tertiary text-center py-3">No teams created in this workspace.</p>
              ) : (
                teams?.map(t => {
                  const isMemberOfTeam = getUserTeams(assigningMember.user_id).some(ut => ut.id === t.id);
                  const isToggling = togglingTeamId === t.id;

                  return (
                    <div
                      key={t.id}
                      onClick={async () => {
                        if (isToggling) return;
                        setTogglingTeamId(t.id);
                        try {
                          if (isMemberOfTeam) {
                            await removeTeamMember({ teamId: t.id, userId: assigningMember.user_id });
                          } else {
                            await assignTeamMember({ teamId: t.id, userId: assigningMember.user_id });
                          }
                        } catch (err: any) {
                          console.error('Failed to toggle team membership:', err);
                        } finally {
                          setTogglingTeamId(null);
                        }
                      }}
                      className={`flex items-center justify-between px-3 py-2 rounded-sm border cursor-pointer transition-colors ${
                        isMemberOfTeam
                          ? 'bg-status-success/10 border-status-success/40'
                          : 'bg-transparent border-border hover:bg-bg-surface'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[10px] font-bold text-text-primary bg-bg-surface px-1 py-0.5 rounded-full border border-transparent">
                          {t.key}
                        </span>
                        <span className="text-xs font-medium text-text-primary">{t.name}</span>
                      </div>

                      <div className="flex items-center">
                        {isToggling ? (
                          <div className="w-3.5 h-3.5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                        ) : isMemberOfTeam ? (
                          <span className="text-[11px] font-semibold text-status-success flex items-center space-x-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Assigned</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-tertiary">+ Add</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-border/60 flex justify-end">
              <button
                onClick={() => setAssigningMember(null)}
                className="px-3 py-1.5 text-xs font-semibold text-button-text bg-accent-primary rounded-full hover:bg-accent-primary-hover transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-bg-surface-raised border border-transparent rounded-md shadow-sm">
        {isLoading ? (
          <div className="p-6 text-center text-xs text-text-secondary">Loading members...</div>
        ) : members?.length === 0 ? (
          <div className="p-6 text-center text-xs text-text-secondary">No members found.</div>
        ) : (
          <div className="divide-y divide-border">
            {members?.map(member => {
              const isProcessing = processingId === member.user_id;
              const isSelf = member.user_id === currentUser?.id;
              const userAssignedTeams = getUserTeams(member.user_id);
              const isCreator = currentWorkspace?.created_by === member.user_id;

              return (
                <div
                  key={member.user_id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:px-3.5 sm:py-3 gap-2.5 sm:gap-3 hover:bg-bg-surface/30 transition-colors"
                >
                  {/* Left: Avatar & Info */}
                  <div className="flex items-center space-x-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className={`w-8 h-8 rounded-full overflow-hidden border ${
                          isCreator ? 'border-white ring-2 ring-white' : 'border-border'
                        }`}>
                          <img
                            src={member.profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.profile?.full_name || member.profile?.email || 'User')}&background=282828&color=B3B3B3&rounded=true`}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      {isCreator && (
                        <div
                          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white overflow-hidden text-black flex items-center justify-center shadow-xs border-2 border-white"
                          title="Workspace Owner"
                        >
                          <Shield className="w-2.5 h-2.5 fill-current" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-medium text-text-primary truncate">
                          {member.profile?.full_name || 'Unnamed User'}
                        </span>
                        {isSelf && !isCreator && (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase bg-bg-surface text-text-secondary rounded-full">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-text-tertiary truncate">
                        {member.profile?.email || 'No email provided'}
                      </div>

                      {/* Assigned Teams */}
                      <div className="mt-0.5 flex items-center space-x-1.5 flex-wrap text-[11px]">
                        {userAssignedTeams.length > 0 ? (
                          <span className="font-medium text-status-success">
                            {userAssignedTeams.map(t => t.name).join(', ')}
                          </span>
                        ) : (
                          <span className="text-text-tertiary italic">No teams assigned</span>
                        )}
                        {isAdmin && (
                          <>
                            {userAssignedTeams.length > 0 && (
                              <span className="text-text-tertiary">·</span>
                            )}
                            <button
                              onClick={() => setAssigningMember(member)}
                              className="font-medium text-accent-primary hover:text-accent-primary-hover hover:underline"
                            >
                              {userAssignedTeams.length > 0 ? 'Edit' : '+ Assign'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Role & Actions */}
                  <div className="flex items-center space-x-3 shrink-0 self-end sm:self-center pl-11 sm:pl-3">
                    {/* Role display / selector */}
                    <div className="flex items-center space-x-1.5">
                      {member.status === 'pending' && (
                        <span className="px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase bg-status-warning/15 text-status-warning border border-transparent rounded-full">
                          Pending
                        </span>
                      )}
                      {isAdmin && !isSelf && !isCreator ? (
                        <CustomSelect
                          value={member.role}
                          onChange={(val) => handleRoleChange(member.user_id, val as 'admin' | 'member')}
                          disabled={isProcessing}
                          options={[
                            { value: 'member', label: 'Member' },
                            { value: 'admin', label: 'Admin' },
                          ]}
                          size="xs"
                        />
                      ) : (
                        <div className="flex items-center space-x-1 text-text-secondary bg-bg-surface/50 px-2 py-0.5 rounded-full border border-transparent/50">
                          {member.role === 'admin' ? <ShieldAlert className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          <span className="text-[11px] font-medium capitalize">{member.role}</span>
                        </div>
                      )}
                    </div>

                    {/* Remove Action */}
                    {isAdmin && !isSelf && !isCreator && (
                      <button
                        onClick={() => handleRemove(member.user_id, member.profile?.full_name || member.profile?.email || 'this member')}
                        disabled={isProcessing}
                        className="p-1 text-text-tertiary hover:text-status-error hover:bg-status-error/10 rounded-full transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Remove Workspace Member In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={!!removingMember}
        title="Remove Member from Workspace"
        message={`Are you sure you want to remove ${removingMember?.name} from this workspace? They will lose access to all teams, projects, and issues.`}
        confirmText="Remove Member"
        variant="danger"
        isLoading={!!processingId}
        onConfirm={handleConfirmRemove}
        onCancel={() => !processingId && setRemovingMember(null)}
      />
    </div>
  );
};
