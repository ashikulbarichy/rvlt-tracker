import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Issue, Profile } from '../types/database';

interface UseIssuesOptions {
  workspaceId?: string;
  projectId?: string;
  teamId?: string;
  assigneeId?: string;
  statusId?: string;
  page?: number;
  limit?: number;
  searchQuery?: string;
}

export function useIssues(options: UseIssuesOptions) {
  const queryClient = useQueryClient();
  const { workspaceId, projectId, teamId, assigneeId, statusId, page = 1, limit = 24, searchQuery } = options;

  const queryKey = ['issues', { workspaceId, projectId, teamId, assigneeId, statusId, page, limit, searchQuery }];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspaceId) return { data: [], count: 0 };

      let query = supabase
        .from('issues')
        .select(`
          *,
          status:state_id(id, name, color, position, category),
          team:team_id(id, name, key),
          project:project_id(id, name, key),
          workspace:workspace_id(id, name, issue_prefix)
        `, { count: 'exact' })
        .eq('workspace_id', workspaceId);

      if (projectId) query = query.eq('project_id', projectId);
      if (teamId) query = query.eq('team_id', teamId);
      if (statusId) query = query.eq('state_id', statusId);
      if (searchQuery) query = query.ilike('title', `%${searchQuery}%`);

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      
      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, error, count } = await query;
      
      if (error) throw error;
      if (!data || data.length === 0) return { data: [], count: 0 };

      const issueIds = data.map(i => i.id);
      const issueAssigneeMap: Record<string, string[]> = {};
      const allAssigneeUserIds = new Set<string>();

      // Seed single assignee_id and reporter_id
      data.forEach(i => {
        if (i.assignee_id) allAssigneeUserIds.add(i.assignee_id);
        if (i.reporter_id) allAssigneeUserIds.add(i.reporter_id);
      });

      // Hydrate multi-assignees from public.issue_assignees
      try {
        const { data: assigneesData } = await supabase
          .from('issue_assignees')
          .select('issue_id, user_id')
          .in('issue_id', issueIds);

        if (assigneesData) {
          assigneesData.forEach(row => {
            if (!issueAssigneeMap[row.issue_id]) issueAssigneeMap[row.issue_id] = [];
            issueAssigneeMap[row.issue_id].push(row.user_id);
            allAssigneeUserIds.add(row.user_id);
          });
        }
      } catch (assigneeErr) {
        console.warn('issue_assignees fetch warning:', assigneeErr);
      }

      // Hydrate all unique user profiles
      let profiles: Profile[] = [];
      const userIdsList = Array.from(allAssigneeUserIds);
      if (userIdsList.length > 0) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIdsList);
        profiles = pData || [];
      }

      let mappedIssues = data.map(issue => {
        const assignedUserIds = issueAssigneeMap[issue.id] || (issue.assignee_id ? [issue.assignee_id] : []);
        const assignedProfiles = assignedUserIds
          .map(uid => profiles.find(p => p.id === uid))
          .filter(Boolean) as Profile[];

        // Dynamically build ticketing name: [WS_PREFIX]-[TEAM_KEY]-[NUMBER]
        const wsPrefix = (issue.workspace?.issue_prefix || 'XXX').toUpperCase().trim();
        const teamKey = (issue.team?.key || issue.project?.key || '').toUpperCase().trim();
        const num = issue.issue_number || 1;
        const formattedNum = String(num).padStart(2, '0');
        const dynamicIdentifier = teamKey
          ? `${wsPrefix}-${teamKey}-${formattedNum}`
          : `${wsPrefix}-${formattedNum}`;

        return {
          ...issue,
          identifier: dynamicIdentifier,
          assignee: profiles.find(p => p.id === issue.assignee_id) || assignedProfiles[0] || null,
          assignees: assignedProfiles,
          assignee_ids: assignedUserIds,
          reporter: profiles.find(p => p.id === issue.reporter_id) || null,
          status: issue.status || null,
          state: issue.status || null
        };
      });

      // Filter by assigneeId if specified (e.g. "Mine" filter)
      if (assigneeId) {
        mappedIssues = mappedIssues.filter(i => 
          i.assignee_id === assigneeId || i.assignee_ids.includes(assigneeId)
        );
      }

      return {
        data: mappedIssues,
        count: count || 0
      };
    },
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: async (newIssue: Partial<Issue> & { workspace_id: string; title: string; assignee_ids?: string[] }) => {
      // 1. Ensure valid team_id
      let finalTeamId = newIssue.team_id;
      if (!finalTeamId) {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('id')
          .eq('workspace_id', newIssue.workspace_id)
          .limit(1);

        if (teamsData && teamsData.length > 0) {
          finalTeamId = teamsData[0].id;
        } else {
          // Create default team
          const { data: newTeam, error: teamErr } = await supabase
            .from('teams')
            .insert([{
              workspace_id: newIssue.workspace_id,
              name: 'Engineering',
              key: 'ENG'
            }])
            .select('id')
            .single();

          if (!teamErr && newTeam) {
            finalTeamId = newTeam.id;
          }
        }
      }

      // 2. Ensure valid state_id (required NOT NULL by schema)
      let finalStateId = newIssue.state_id;
      if (!finalStateId) {
        let stateQuery = supabase
          .from('workflow_states')
          .select('id')
          .eq('workspace_id', newIssue.workspace_id);

        if (finalTeamId) {
          stateQuery = stateQuery.eq('team_id', finalTeamId);
        }

        const { data: stateData } = await stateQuery.order('position').limit(1);

        if (stateData && stateData.length > 0) {
          finalStateId = stateData[0].id;
        } else {
          // Create default workflow states
          const defaultStates = [
            { workspace_id: newIssue.workspace_id, team_id: finalTeamId, name: 'Backlog', color: '#726A5C', position: 0, category: 'backlog', is_default: true },
            { workspace_id: newIssue.workspace_id, team_id: finalTeamId, name: 'Todo', color: '#6E8299', position: 1, category: 'unstarted', is_default: false },
            { workspace_id: newIssue.workspace_id, team_id: finalTeamId, name: 'In Progress', color: '#C7963E', position: 2, category: 'started', is_default: false },
            { workspace_id: newIssue.workspace_id, team_id: finalTeamId, name: 'Done', color: '#7C8B6F', position: 3, category: 'completed', is_default: false },
          ];
          const { data: createdStates } = await supabase
            .from('workflow_states')
            .insert(defaultStates)
            .select('id');

          if (createdStates && createdStates.length > 0) {
            finalStateId = createdStates[1]?.id || createdStates[0]?.id;
          }
        }
      }

      // 3. Ensure reporter_id
      let finalReporterId = newIssue.reporter_id;
      if (!finalReporterId) {
        const { data: authData } = await supabase.auth.getUser();
        finalReporterId = authData?.user?.id || null;
      }

      // Primary assignee from list or single
      const primaryAssigneeId = (newIssue.assignee_ids && newIssue.assignee_ids.length > 0)
        ? newIssue.assignee_ids[0]
        : (newIssue.assignee_id || null);

      const payload: any = {
        workspace_id: newIssue.workspace_id,
        team_id: finalTeamId,
        title: newIssue.title,
        description: newIssue.description || '',
        priority: newIssue.priority || 'medium',
        assignee_id: primaryAssigneeId,
        project_id: newIssue.project_id || null,
        reporter_id: finalReporterId,
        due_date: newIssue.due_date || null,
        estimate: newIssue.estimate !== undefined ? newIssue.estimate : null,
      };

      if (finalStateId) {
        payload.state_id = finalStateId;
      }

      const { data: createdIssue, error } = await supabase
        .from('issues')
        .insert([payload])
        .select(`
          *,
          status:state_id(id, name, color, position, category)
        `)
        .single();
      
      if (error) {
        console.error('Failed to create issue:', error);
        throw error;
      }

      // 4. Save multi-assignees in issue_assignees join table
      const assigneesToSave = newIssue.assignee_ids || (newIssue.assignee_id ? [newIssue.assignee_id] : []);
      if (assigneesToSave.length > 0 && createdIssue) {
        const rows = assigneesToSave.map(uid => ({
          workspace_id: newIssue.workspace_id,
          issue_id: createdIssue.id,
          user_id: uid
        }));

        try {
          await supabase.from('issue_assignees').insert(rows);
        } catch (e) {
          console.warn('issue_assignees insert notice:', e);
        }

        // Notify assigned users
        for (const uid of assigneesToSave) {
          if (uid !== finalReporterId) {
            try {
              await supabase.from('notifications').insert([{
                workspace_id: newIssue.workspace_id,
                recipient_id: uid,
                actor_id: finalReporterId,
                type: 'assignment',
                title: 'Task Assigned',
                message: `You were assigned to task "${newIssue.title}"`,
                entity_type: 'issue',
                entity_id: createdIssue.id,
                is_read: false
              }]);
            } catch (notifErr) {
              console.warn('Notification send note:', notifErr);
            }
          }
        }
      }

      return createdIssue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['workflow_states'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, workspace_id, assignee_ids, ...updates }: Partial<Issue> & { id: string, workspace_id: string; assignee_ids?: string[] }) => {
      // If assignee_ids is provided, update issue_assignees table
      if (assignee_ids !== undefined) {
        try {
          // Remove previous assignees
          await supabase.from('issue_assignees').delete().eq('issue_id', id);

          // Add new assignees
          if (assignee_ids.length > 0) {
            const rows = assignee_ids.map(uid => ({
              workspace_id,
              issue_id: id,
              user_id: uid
            }));
            await supabase.from('issue_assignees').insert(rows);
          }

          // Set primary assignee
          updates.assignee_id = assignee_ids.length > 0 ? assignee_ids[0] : null;
        } catch (e) {
          console.warn('issue_assignees update warning:', e);
        }
      }

      const { data, error } = await supabase
        .from('issues')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, workspace_id }: { id: string, workspace_id: string }) => {
      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    }
  });

  return {
    issues: data?.data || [],
    totalCount: data?.count || 0,
    isLoading,
    error,
    createIssue: createMutation.mutate,
    updateIssue: updateMutation.mutate,
    deleteIssue: deleteMutation.mutate,
  };
}
