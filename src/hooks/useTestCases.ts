import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { TestCase, TestCaseStatus } from '../types/database';
import { useApp } from '../context/AppContext';

export function useTestCases() {
  const queryClient = useQueryClient();
  const { currentWorkspace, currentProject, currentUser } = useApp();

  const { data: testCases, isLoading, error } = useQuery({
    queryKey: ['testCases', currentWorkspace?.id, currentProject?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];

      let query = supabase
        .from('test_cases')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: false });

      if (currentProject) {
        query = query.eq('project_id', currentProject.id);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching test cases:', error);
        throw error;
      }
      return (data || []) as TestCase[];
    },
    enabled: !!currentWorkspace
  });

  const createTestCaseMutation = useMutation({
    mutationFn: async (newTestCase: Partial<TestCase>) => {
      if (!currentWorkspace) throw new Error('Missing active workspace');

      const payload: any = {
        title: newTestCase.title,
        preconditions: newTestCase.preconditions || '',
        steps: newTestCase.steps || '',
        expected_result: newTestCase.expected_result || '',
        status: newTestCase.status || 'untested',
        priority: newTestCase.priority || 'medium',
        workspace_id: currentWorkspace.id,
        project_id: newTestCase.project_id || currentProject?.id || null,
        created_by: currentUser?.id || null,
      };

      // Strip any undefined keys
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

      const { data, error } = await supabase
        .from('test_cases')
        .insert([payload])
        .select()
        .single();
      
      if (error) {
        console.error('Supabase error creating test case:', error);
        throw error;
      }
      return data as TestCase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testCases'] });
    }
  });

  const updateTestCaseMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TestCase> & { id: string }) => {
      if (!currentWorkspace) throw new Error('Missing active workspace');

      const { data, error } = await supabase
        .from('test_cases')
        .update(updates)
        .eq('id', id)
        .eq('workspace_id', currentWorkspace.id)
        .select()
        .single();
        
      if (error) {
        console.error('Supabase error updating test case:', error);
        throw error;
      }
      return data as TestCase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testCases'] });
    }
  });

  const updateTestCaseStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: TestCase['status'] }) => {
      if (!currentWorkspace) throw new Error('Missing active workspace');

      const { data, error } = await supabase
        .from('test_cases')
        .update({ status })
        .eq('id', id)
        .eq('workspace_id', currentWorkspace.id)
        .select()
        .single();
        
      if (error) {
        console.error('Supabase error updating test case status:', error);
        throw error;
      }
      return data as TestCase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testCases'] });
    }
  });

  const deleteTestCaseMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!currentWorkspace) throw new Error('Missing active workspace');

      const { error } = await supabase
        .from('test_cases')
        .delete()
        .eq('id', id)
        .eq('workspace_id', currentWorkspace.id);
        
      if (error) {
        console.error('Supabase error deleting test case:', error);
        throw error;
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testCases'] });
    }
  });

  return {
    testCases,
    isLoading,
    error,
    createTestCase: createTestCaseMutation.mutate,
    createTestCaseAsync: createTestCaseMutation.mutateAsync,
    updateTestCase: updateTestCaseMutation.mutate,
    updateTestCaseAsync: updateTestCaseMutation.mutateAsync,
    updateTestCaseStatus: updateTestCaseStatusMutation.mutate,
    updateTestCaseStatusAsync: updateTestCaseStatusMutation.mutateAsync,
    deleteTestCase: deleteTestCaseMutation.mutate,
    deleteTestCaseAsync: deleteTestCaseMutation.mutateAsync
  };
}
