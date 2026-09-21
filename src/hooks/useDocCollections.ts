import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { DocCollection } from '../types/database';
import { useApp } from '../context/AppContext';

/**
 * The top-level shelves of the docs tree, workspace-scoped.
 *
 * Writes are admin-only at the RLS level, so a non-admin calling these gets a rejected
 * promise rather than a silent no-op. Callers surface it.
 */
export function useDocCollections() {
  const { currentWorkspace } = useApp();

  const { data: collections, isLoading, error, refetch } = useQuery({
    queryKey: ['doc_collections', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];

      const { data, error } = await supabase
        .from('doc_collections')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('position');

      if (error) throw error;
      return data as DocCollection[];
    },
    enabled: !!currentWorkspace,
  });

  const createCollection = async (input: Pick<DocCollection, 'name'> & Partial<DocCollection>) => {
    if (!currentWorkspace) throw new Error('No workspace selected.');

    const position = (collections || []).reduce((max, c) => Math.max(max, c.position), -1) + 1;

    const { error } = await supabase.from('doc_collections').insert({
      workspace_id: currentWorkspace.id,
      name: input.name.trim(),
      icon: input.icon ?? 'folder',
      color: input.color ?? '#6B7280',
      position,
    });

    if (error) throw error;
    await refetch();
  };

  const updateCollection = async (id: string, updates: Partial<DocCollection>) => {
    const { error } = await supabase
      .from('doc_collections')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('workspace_id', currentWorkspace?.id);

    if (error) throw error;
    await refetch();
  };

  /** Docs on a deleted shelf survive: collection_id is `on delete set null`. */
  const deleteCollection = async (id: string) => {
    const { error } = await supabase
      .from('doc_collections')
      .delete()
      .eq('id', id)
      .eq('workspace_id', currentWorkspace?.id);

    if (error) throw error;
    await refetch();
  };

  return {
    collections,
    isLoading,
    error,
    createCollection,
    updateCollection,
    deleteCollection,
    refetch,
  };
}
