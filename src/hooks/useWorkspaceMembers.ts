import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Profile, MemberStatus } from '../types/database';

export type WorkspaceMemberWithProfile = {
  workspace_id: string;
  user_id: string;
  role: 'admin' | 'member';
  status: MemberStatus;
  joined_at: string;
  profile: Profile | null;
};

export function useUserWorkspaceRole(workspaceId?: string, userId?: string) {
  return useQuery({
    queryKey: ['workspace_role', workspaceId, userId],
    queryFn: async () => {
      if (!workspaceId || !userId) return 'member' as const;
      const { data, error } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) return 'member' as const;
      return data.role as 'admin' | 'member';
    },
    enabled: !!workspaceId && !!userId
  });
}

export function useWorkspaceMembers(workspaceId?: string) {
  const queryClient = useQueryClient();

  const { data: members, isLoading, error } = useQuery({
    queryKey: ['workspace_members', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      // 1. Fetch workspace members
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId);
      
      if (memberError) throw memberError;

      // 2. Fetch pending invitations from workspace_invitations
      let pendingInvites: any[] = [];
      try {
        const { data: inviteData } = await supabase
          .from('workspace_invitations')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('status', 'pending');
        if (inviteData) pendingInvites = inviteData;
      } catch {
        // workspace_invitations table may be pending
      }

      const allUserIds = Array.from(new Set([
        ...(memberData || []).map(m => m.user_id),
        ...pendingInvites.map(i => i.user_id)
      ]));

      if (allUserIds.length === 0) return [];

      // 3. Fetch profiles for these members & invitees
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', allUserIds);
      
      if (profileError) throw profileError;

      // 4. Map active members
      const activeMembers: WorkspaceMemberWithProfile[] = (memberData || []).map(member => ({
        ...member,
        status: ((member as any).status as MemberStatus) || 'accepted',
        profile: profiles?.find(p => p.id === member.user_id) || null
      }));

      // 5. Add pending invitations not yet in workspace_members
      const existingUserIds = new Set(activeMembers.map(m => m.user_id));
      const pendingMembers: WorkspaceMemberWithProfile[] = pendingInvites
        .filter(inv => !existingUserIds.has(inv.user_id))
        .map(inv => ({
          workspace_id: inv.workspace_id,
          user_id: inv.user_id,
          role: inv.role,
          status: 'pending' as MemberStatus,
          joined_at: inv.created_at,
          profile: profiles?.find(p => p.id === inv.user_id) || null
        }));

      return [...activeMembers, ...pendingMembers];
    },
    enabled: !!workspaceId
  });

  const addMember = useMutation({
    mutationFn: async ({ userId, role = 'member', email = '' }: { userId: string; role?: 'admin' | 'member'; email?: string }) => {
      if (!workspaceId) throw new Error('No workspace selected');

      // Attempt to insert into workspace_invitations first
      try {
        const { data: invData, error: invErr } = await supabase
          .from('workspace_invitations')
          .insert([{
            workspace_id: workspaceId,
            user_id: userId,
            email: email || '',
            role,
            status: 'pending'
          }])
          .select()
          .maybeSingle();

        if (!invErr && invData) return invData;
      } catch (err) {
        console.warn('workspace_invitations insert note:', err);
      }

      // Fallback: direct insert into workspace_members
      const { data, error } = await supabase
        .from('workspace_members')
        .insert([{
          workspace_id: workspaceId,
          user_id: userId,
          role
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace_members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace_role', workspaceId] });
    }
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'member' }) => {
      if (!workspaceId) throw new Error('No workspace selected');

      const { data, error } = await supabase
        .from('workspace_members')
        .update({ role })
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace_members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace_role', workspaceId] });
    }
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      if (!workspaceId) throw new Error('No workspace selected');

      // Remove from workspace_members
      await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId);

      // Also clean up any invitations
      try {
        await supabase
          .from('workspace_invitations')
          .delete()
          .eq('workspace_id', workspaceId)
          .eq('user_id', userId);
      } catch {
        // ignore
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace_members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace_role', workspaceId] });
    }
  });

  const acceptInvitation = useMutation({
    mutationFn: async (targetWorkspaceId: string) => {
      // 1. Try secure RPC function
      const { error: rpcError } = await supabase.rpc('accept_workspace_invitation', {
        target_workspace_id: targetWorkspaceId
      });

      if (!rpcError) return;

      // 2. Fallback: direct insert into workspace_members
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id;
      if (!currentUserId) throw new Error('Not authenticated');

      await supabase
        .from('workspace_members')
        .insert([{
          workspace_id: targetWorkspaceId,
          user_id: currentUserId,
          role: 'member'
        }]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace_members'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const declineInvitation = useMutation({
    mutationFn: async (targetWorkspaceId: string) => {
      // 1. Try secure RPC function
      const { error: rpcError } = await supabase.rpc('decline_workspace_invitation', {
        target_workspace_id: targetWorkspaceId
      });

      if (!rpcError) return;

      // 2. Fallback: update status in workspace_invitations
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        await supabase
          .from('workspace_invitations')
          .update({ status: 'declined' })
          .eq('workspace_id', targetWorkspaceId)
          .eq('user_id', authData.user.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace_members'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  return {
    members,
    isLoading,
    error,
    addMember: addMember.mutate,
    updateMemberRole: updateMemberRole.mutate,
    removeMember: removeMember.mutate,
    acceptInvitation: acceptInvitation.mutateAsync,
    declineInvitation: declineInvitation.mutateAsync
  };
}
