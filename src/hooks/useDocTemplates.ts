import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { DocTemplate } from '../types/database';
import { useApp } from '../context/AppContext';

/**
 * Document templates for the workspace.
 *
 * Their own table rather than docs flagged `is_template`, so they never leak into the
 * tree, search, breadcrumbs or "recently edited".
 */
export function useDocTemplates() {
  const { currentWorkspace, currentUser } = useApp();

  const { data: templates, isLoading, error, refetch } = useQuery({
    queryKey: ['doc_templates', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];

      const { data, error } = await supabase
        .from('doc_templates')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('position');

      if (error) throw error;
      return data as DocTemplate[];
    },
    enabled: !!currentWorkspace,
  });

  /** Grouped for the picker, preserving each category's first-seen order. */
  const byCategory = (templates || []).reduce<Record<string, DocTemplate[]>>((acc, t) => {
    (acc[t.category] ||= []).push(t);
    return acc;
  }, {});

  const createTemplate = async (
    input: Pick<DocTemplate, 'name'> & Partial<DocTemplate>
  ) => {
    if (!currentWorkspace) throw new Error('No workspace selected.');

    const position = (templates || []).reduce((max, t) => Math.max(max, t.position), -1) + 1;

    const { error } = await supabase.from('doc_templates').insert({
      workspace_id: currentWorkspace.id,
      name: input.name.trim(),
      description: input.description ?? '',
      category: input.category ?? 'General',
      icon: input.icon ?? 'file-text',
      content: input.content ?? '',
      is_builtin: false,
      position,
      created_by: currentUser?.id ?? null,
    });

    if (error) throw error;
    await refetch();
  };

  const updateTemplate = async (id: string, updates: Partial<DocTemplate>) => {
    const { error } = await supabase
      .from('doc_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', currentWorkspace?.id);

    if (error) throw error;
    await refetch();
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase
      .from('doc_templates')
      .delete()
      .eq('id', id)
      .eq('workspace_id', currentWorkspace?.id);

    if (error) throw error;
    await refetch();
  };

  return {
    templates,
    byCategory,
    isLoading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    refetch,
  };
}
