import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useTeams } from '../../hooks/useTeams';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import { useWorkspaceMembers } from '../../hooks/useWorkspaceMembers';
import { Team } from '../../types/database';
import { IconPicker } from '../common/IconPicker';
import { TeamWorkflowSettings } from './TeamWorkflowSettings';
import { ConfirmModal } from '../common/ConfirmModal';
import * as Icons from 'lucide-react';
import {
  Users2,
  Plus,
  Trash2,
  X,
  Check,
  Users,
  ArrowLeft,
  Search,
  Mail,
  Shield,
  UserPlus,
  UserMinus,
  Edit2
} from 'lucide-react';

export const TeamSettings: React.FC = () => {
  const { currentWorkspace, userRole, currentUser, currentTeam, setCurrentTeam } = useApp();
  const { teams, isLoading, createTeam, updateTeam, deleteTeam } = useTeams(currentWorkspace?.id);
  const { members: workspaceMembers } = useWorkspaceMembers(currentWorkspace?.id);
  const { assignMember, removeMember, getTeamUsers } = useTeamMembers(currentWorkspace?.id);

  const [selectedTeam, setSelectedTeam] = useState<Team | null>(currentTeam || null);

  React.useEffect(() => {
    if (currentTeam) setSelectedTeam(currentTeam);
  }, [currentTeam?.id]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [searchMemberQuery, setSearchMemberQuery] = useState('');

  // New Team Form State
  const [teamName, setTeamName] = useState('');
  const [teamKey, setTeamKey] = useState('');
  const [teamIcon, setTeamIcon] = useState('Hexagon');
  const [teamDesc, setTeamDesc] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // In-app Delete Confirmation State
  const [deletingTeam, setDeletingTeam] = useState<{ id: string; name: string } | null>(null);
  const [removingMember, setRemovingMember] = useState<{ teamId: string; teamName: string; userId: string; userName: string } | null>(null);

  const isAdmin = userRole === 'admin' || !currentWorkspace || currentWorkspace?.created_by === currentUser?.id;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !isAdmin) return;

    setIsSaving(true);
    setStatusMessage(null);
    createTeam(
      {
        workspace_id: currentWorkspace.id,
        name: teamName.trim(),
        key: teamKey.trim().toUpperCase(),
        icon: teamIcon,
        description: teamDesc.trim() || undefined
      },
      {
        onSuccess: (newTeam) => {
          setStatusMessage({ type: 'success', text: 'Team created successfully.' });
          setIsAddModalOpen(false);
          setTeamName('');
          setTeamKey('');
          setTeamIcon('Hexagon');
          setTeamDesc('');
          if (newTeam) setSelectedTeam(newTeam);
          setTimeout(() => setStatusMessage(null), 4000);
        },
        onError: (err: any) => {
          setStatusMessage({ type: 'error', text: err?.message || 'Failed to create team.' });
        },
        onSettled: () => setIsSaving(false)
      }
    );
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || !isAdmin) return;

    setIsSaving(true);
    setStatusMessage(null);
    updateTeam(
      {
        id: selectedTeam.id,
        workspace_id: selectedTeam.workspace_id,
        name: teamName.trim(),
        key: teamKey.trim().toUpperCase(),
        icon: teamIcon,
        description: teamDesc.trim() || undefined
      },
      {
        onSuccess: (updatedTeam) => {
          setStatusMessage({ type: 'success', text: 'Team updated successfully.' });
          setIsEditModalOpen(false);
          if (updatedTeam) setSelectedTeam(updatedTeam);
          setTimeout(() => setStatusMessage(null), 4000);
        },
        onError: (err: any) => {
          setStatusMessage({ type: 'error', text: err?.message || 'Failed to update team.' });
        },
        onSettled: () => setIsSaving(false)
      }
    );
  };

  const handleEditClick = () => {
    if (!selectedTeam) return;
    setTeamName(selectedTeam.name);
    setTeamKey(selectedTeam.key);
    setTeamIcon(selectedTeam.icon || 'Hexagon');
    setTeamDesc(selectedTeam.description || '');
    setIsEditModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (!isAdmin) return;
    setDeletingTeam({ id, name });
  };

  const handleConfirmDeleteTeam = () => {
    if (!deletingTeam) return;
    setStatusMessage(null);
    deleteTeam(deletingTeam.id, {
      onSuccess: () => {
        setStatusMessage({ type: 'success', text: 'Team deleted successfully.' });
        setSelectedTeam(null);
        setDeletingTeam(null);
        setTimeout(() => setStatusMessage(null), 4000);
      },
      onError: (err: any) => {
        setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete team.' });
        setDeletingTeam(null);
      }
    });
  };

  // -------------------------------------------------------------
  // View 1: Specific Team Detailed Member View
  // -------------------------------------------------------------
  if (selectedTeam) {
    const teamUsers = getTeamUsers(selectedTeam.id);
    const assignedUserIds = teamUsers.map(tu => tu.user_id);

    // Workspace members that are in this team
    const assignedMembers = (workspaceMembers || []).filter(m =>
      assignedUserIds.includes(m.user_id)
    );

    // Workspace members not yet in this team
    const unassignedMembers = (workspaceMembers || []).filter(m =>
      !assignedUserIds.includes(m.user_id)
    );

    const filteredAssignedMembers = assignedMembers.filter(m => {
      if (!searchMemberQuery.trim()) return true;
      const q = searchMemberQuery.toLowerCase();
      const name = m.profile?.full_name?.toLowerCase() || '';
      const email = m.profile?.email?.toLowerCase() || '';
      return name.includes(q) || email.includes(q);
    });

    const TeamIconComponent = (Icons as any)[selectedTeam.icon || 'Hexagon'] || Icons.Hexagon;

    return (
      <div className="max-w-4xl font-sans space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              if (setCurrentTeam) setCurrentTeam(null);
              setSelectedTeam(null);
              setSearchMemberQuery('');
            }}
            className="flex items-center space-x-1.5 text-xs font-medium text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-md hover:bg-bg-surface transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to all teams</span>
          </button>

          {isAdmin && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleEditClick}
                className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-surface rounded border border-border transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Team</span>
              </button>
              <button
                onClick={() => handleDelete(selectedTeam.id, selectedTeam.name)}
                className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-status-error hover:bg-status-error/10 rounded border border-status-error/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>

        {/* Team Overview Card */}
        <div className="p-5 bg-bg-surface border border-border rounded-lg shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-bg-surface border border-border flex items-center justify-center text-text-primary shrink-0">
              <TeamIconComponent className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-karla font-semibold text-text-primary truncate">
                  {selectedTeam.name}
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium bg-bg-surface text-text-secondary border border-border rounded">
                  {selectedTeam.key}
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                {selectedTeam.description || 'No description provided for this team.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <div className="px-3 py-1.5 bg-transparent border border-text-primary rounded text-center">
              <div className="text-xs font-semibold text-text-primary">{assignedMembers.length}</div>
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Members</div>
            </div>
            {isAdmin && unassignedMembers.length > 0 && (
              <button
                onClick={() => setIsAddMemberModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-bg-base bg-accent-primary hover:bg-accent-primary-hover rounded transition-colors shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            )}
          </div>
        </div>

        {/* Members Section */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-karla font-semibold text-text-primary">
                Team Members ({assignedMembers.length})
              </h2>
              <p className="text-xs text-text-secondary">
                Detailed list of all people assigned to this team.
              </p>
            </div>

            {assignedMembers.length > 0 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter team members..."
                  value={searchMemberQuery}
                  onChange={e => setSearchMemberQuery(e.target.value)}
                  className="w-56 pl-8 pr-3 py-1 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                />
              </div>
            )}
          </div>

          {/* Members Cards List */}
          {assignedMembers.length === 0 ? (
            <div className="p-10 text-center text-xs text-text-secondary bg-bg-surface border border-border rounded-lg space-y-2">
              <Users className="w-8 h-8 text-text-tertiary mx-auto opacity-60" />
              <div className="font-semibold text-text-primary">No members assigned yet</div>
              <p className="text-[11px] text-text-tertiary">
                Assign workspace members to this team so they can collaborate on tasks.
              </p>
              {isAdmin && unassignedMembers.length > 0 && (
                <div className="pt-2">
                  <button
                    onClick={() => setIsAddMemberModalOpen(true)}
                    className="px-3 py-1.5 text-xs font-medium text-bg-base bg-accent-primary hover:bg-accent-primary-hover rounded transition-colors"
                  >
                    Add First Member
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredAssignedMembers.map(m => {
                const isToggling = togglingUserId === m.user_id;
                const isCreator = currentWorkspace?.created_by === m.user_id;

                return (
                  <div
                    key={m.user_id}
                    className="p-3.5 bg-transparent hover:bg-bg-surface-hover border border-border rounded-lg shadow-xs transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className={`w-9 h-9 rounded-full overflow-hidden border ${
                            isCreator ? 'border-white ring-2 ring-white' : 'border-border'
                          }`}>
                          <img
                            src={m.profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.profile?.full_name || m.profile?.email || 'User')}&background=EFE8DC&color=3A342C`}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {isCreator && (
                          <div
                            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white text-black flex items-center justify-center shadow-xs border-2 border-white"
                            title="Workspace Owner"
                          >
                            <Shield className="w-2.5 h-2.5 fill-current" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-text-primary truncate">
                            {m.profile?.full_name || 'User'}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-bg-surface text-text-secondary border border-border uppercase">
                            {m.role || 'Member'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1 text-[11px] text-text-secondary truncate mt-0.5">
                          <Mail className="w-3 h-3 text-text-tertiary shrink-0" />
                          <span className="truncate">{m.profile?.email || 'No email'}</span>
                        </div>
                      </div>
                    </div>

                    {isAdmin && !isCreator && (
                      <button
                        onClick={() => {
                          if (isToggling) return;
                          setRemovingMember({
                            teamId: selectedTeam.id,
                            teamName: selectedTeam.name,
                            userId: m.user_id,
                            userName: m.profile?.full_name || m.profile?.email || 'this member'
                          });
                        }}
                        disabled={isToggling}
                        className="p-1.5 text-text-tertiary hover:text-status-error hover:bg-status-error/10 rounded transition-colors shrink-0"
                        title="Remove from team"
                      >
                        {isToggling ? (
                          <div className="w-3.5 h-3.5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <UserMinus className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <TeamWorkflowSettings teamId={selectedTeam.id} />

        {/* Add Member Modal */}
        {isAddMemberModalOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 font-sans">
            <div className="bg-bg-surface border border-border rounded-lg max-w-md w-full p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <div>
                  <h3 className="text-sm font-karla font-semibold text-text-primary">
                    Add Members to {selectedTeam.name}
                  </h3>
                  <p className="text-[11px] text-text-secondary">
                    Select workspace members to assign to this team.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddMemberModalOpen(false)}
                  className="text-text-tertiary hover:text-text-primary p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {unassignedMembers.length === 0 ? (
                  <p className="text-xs text-text-tertiary text-center py-4">
                    All workspace members are already assigned to this team.
                  </p>
                ) : (
                  unassignedMembers.map(m => {
                    const isToggling = togglingUserId === m.user_id;

                    return (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between p-2.5 bg-bg-surface border border-border rounded-md hover:bg-bg-surface transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <img
                            src={m.profile?.avatar_url || `https://ui-avatars.com/api/?name=${m.profile?.full_name || 'User'}&background=EFE8DC&color=3A342C`}
                            alt="Avatar"
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-text-primary truncate">
                              {m.profile?.full_name || 'User'}
                            </div>
                            <div className="text-[10px] text-text-secondary truncate">{m.profile?.email}</div>
                          </div>
                        </div>

                        <button
                          onClick={async () => {
                            if (isToggling) return;
                            setTogglingUserId(m.user_id);
                            try {
                              await assignMember({ teamId: selectedTeam.id, userId: m.user_id });
                            } finally {
                              setTogglingUserId(null);
                            }
                          }}
                          disabled={isToggling}
                          className="px-2.5 py-1 bg-accent-primary hover:bg-accent-primary-hover text-bg-base text-xs font-medium rounded transition-colors disabled:opacity-50"
                        >
                          {isToggling ? 'Adding...' : 'Add'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-2 border-t border-border/60 flex justify-end">
                <button
                  onClick={() => setIsAddMemberModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-surface rounded transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Edit Team Modal */}
        {isEditModalOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 font-sans">
            <div className="bg-bg-surface border border-border rounded-lg max-w-md w-full p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <h3 className="text-sm font-karla font-semibold text-text-primary">Edit Team</h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-text-tertiary hover:text-text-primary p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdate} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Team Icon</label>
                  <IconPicker 
                    value={teamIcon} 
                    onChange={setTeamIcon} 
                  />
                </div>

                <div className="flex space-x-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-text-primary mb-1">Team Name *</label>
                    <input
                      type="text"
                      value={teamName}
                      onChange={(e) => {
                        setTeamName(e.target.value);
                        if (!teamKey) {
                          setTeamKey(e.target.value.substring(0, 3).toUpperCase());
                        }
                      }}
                      required
                      placeholder="e.g. Frontend Engineering"
                      className="w-full px-2.5 py-1.5 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                    />
                  </div>

                  <div className="w-1/3">
                    <label className="block text-xs font-medium text-text-primary mb-1">Key *</label>
                    <input
                      type="text"
                      value={teamKey}
                      onChange={(e) => setTeamKey(e.target.value.toUpperCase())}
                      required
                      maxLength={5}
                      placeholder="e.g. ENG"
                      className="w-full px-2.5 py-1.5 text-xs font-mono uppercase bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Description</label>
                  <textarea
                    value={teamDesc}
                    onChange={(e) => setTeamDesc(e.target.value)}
                    rows={2}
                    placeholder="Team scope and deliverables..."
                    className="w-full px-2.5 py-1.5 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                  />
                </div>

                <div className="pt-2 border-t border-border/60 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-surface rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || !teamName || !teamKey}
                    className="px-3 py-1.5 text-xs font-medium text-bg-base bg-accent-primary hover:bg-accent-primary-hover rounded disabled:opacity-50 transition-colors"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // View 2: All Teams Cards List
  // -------------------------------------------------------------
  return (
    <div className="max-w-4xl font-sans space-y-5">
      {/* Header section */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-karla font-semibold text-text-primary mb-1">Teams</h1>
          <p className="text-text-secondary text-sm">
            Organize projects and workflows by department or squad. Click a team to view members in detail.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-sm font-medium text-bg-base bg-accent-primary rounded-md hover:bg-accent-primary-hover transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create Team</span>
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-md text-xs font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-status-success/15 border-status-success text-text-primary'
              : 'bg-status-error/15 border-status-error text-status-error'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Teams Grid on Canvas */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-text-secondary">Loading teams...</div>
      ) : teams?.length === 0 ? (
        <div className="p-16 text-center text-xs text-text-secondary space-y-2 bg-bg-surface/50 border border-border rounded-lg">
          <Users2 className="w-8 h-8 text-text-tertiary mx-auto opacity-60" />
          <div className="font-semibold text-text-primary">No teams configured yet</div>
          <p className="text-[11px] text-text-tertiary">
            Create a team to group issues, test suites, and members.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {teams?.map(team => {
            const teamUsers = getTeamUsers(team.id);
            const teamMembersList = (workspaceMembers || []).filter(m =>
              teamUsers.some(tu => tu.user_id === m.user_id)
            );

            return (
              <div
                key={team.id}
                onClick={() => setSelectedTeam(team)}
                className="group p-4 bg-transparent hover:bg-bg-surface-hover border border-border rounded-lg shadow-xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-7 h-7 rounded bg-bg-surface border border-border flex items-center justify-center text-text-primary shrink-0">
                      {(() => {
                        const Icon = (Icons as any)[team.icon || 'Hexagon'] || Icons.Hexagon;
                        return <Icon className="w-4 h-4" />;
                      })()}
                    </div>

                    <span className="text-[11px] text-accent-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      View Members →
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-text-primary">
                    {team.name}
                  </h3>

                  {team.description && (
                    <p className="text-xs text-text-secondary line-clamp-2">
                      {team.description}
                    </p>
                  )}
                </div>

                {/* Team Footer: Members count & Avatars */}
                <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-text-secondary">
                  <div className="flex items-center space-x-1.5">
                    {teamMembersList.length > 0 ? (
                      <div className="flex -space-x-2 overflow-hidden">
                        {teamMembersList.slice(0, 3).map((m, idx) => (
                          <img
                            key={m.user_id || idx}
                            src={m.profile?.avatar_url || `https://ui-avatars.com/api/?name=${m.profile?.full_name || 'User'}&background=EFE8DC&color=3A342C`}
                            alt="Member"
                            className="w-5 h-5 rounded-full object-cover ring-2 ring-bg-base"
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-text-tertiary">No members</span>
                    )}

                    <span className="text-[11px] font-medium text-text-secondary ml-1">
                      {teamUsers.length} {teamUsers.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>

                  <span className="text-[11px] text-text-tertiary">
                    Click to view details
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Team Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-bg-surface border border-border rounded-lg max-w-md w-full p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <h3 className="text-sm font-karla font-semibold text-text-primary">Create New Team</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-text-tertiary hover:text-text-primary p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Team Icon</label>
                <IconPicker 
                  value={teamIcon} 
                  onChange={setTeamIcon} 
                />
              </div>

              <div className="flex space-x-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-primary mb-1">Team Name *</label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => {
                      setTeamName(e.target.value);
                      if (!teamKey) {
                        setTeamKey(e.target.value.substring(0, 3).toUpperCase());
                      }
                    }}
                    required
                    placeholder="e.g. Frontend Engineering"
                    className="w-full px-2.5 py-1.5 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                  />
                </div>

                <div className="w-1/3">
                  <label className="block text-xs font-medium text-text-primary mb-1">Key *</label>
                  <input
                    type="text"
                    value={teamKey}
                    onChange={(e) => setTeamKey(e.target.value.toUpperCase())}
                    required
                    maxLength={5}
                    placeholder="e.g. ENG"
                    className="w-full px-2.5 py-1.5 text-xs font-mono uppercase bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Description</label>
                <textarea
                  value={teamDesc}
                  onChange={(e) => setTeamDesc(e.target.value)}
                  rows={2}
                  placeholder="Team scope and deliverables..."
                  className="w-full px-2.5 py-1.5 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary"
                />
              </div>

              <div className="pt-2 border-t border-border/60 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-surface rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !teamName || !teamKey}
                  className="px-3 py-1.5 text-xs font-medium text-bg-base bg-accent-primary hover:bg-accent-primary-hover rounded disabled:opacity-50 transition-colors"
                >
                  {isSaving ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Team In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingTeam}
        title="Delete Team"
        message={`Are you sure you want to delete team "${deletingTeam?.name}"? All associated projects and workflow states will be affected.`}
        confirmText="Delete Team"
        variant="danger"
        onConfirm={handleConfirmDeleteTeam}
        onCancel={() => setDeletingTeam(null)}
      />

      {/* Remove Team Member In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={!!removingMember}
        title="Remove Member from Team"
        message={`Are you sure you want to remove ${removingMember?.userName} from ${removingMember?.teamName}?`}
        confirmText="Remove Member"
        variant="danger"
        onConfirm={async () => {
          if (removingMember) {
            setTogglingUserId(removingMember.userId);
            try {
              await removeMember({ teamId: removingMember.teamId, userId: removingMember.userId });
            } finally {
              setTogglingUserId(null);
              setRemovingMember(null);
            }
          }
        }}
        onCancel={() => setRemovingMember(null)}
      />
    </div>
  );
};
