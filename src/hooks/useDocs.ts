import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Doc, DocTreeNode } from '../types/database';
import { useApp } from '../context/AppContext';

/**
 * Build the nested tree from the flat row list.
 *
 * Done client-side rather than with a recursive CTE: a workspace wiki is hundreds of
 * rows, not millions, and one flat fetch keeps the whole tree in a single cache entry
 * that every doc route can share.
 *
 * Orphans — a doc whose parent is filtered out by RLS, or soft-deleted — are promoted to
 * the root rather than dropped, so a private child never silently disappears from its
 * own author's tree.
 */
export function buildDocTree(docs: Doc[]): DocTreeNode[] {
  const byId = new Map<string, DocTreeNode>();
  for (const doc of docs) {
    byId.set(doc.id, { ...doc, children: [], depth: 0 });
  }

  const roots: DocTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (nodes: DocTreeNode[], depth: number) => {
    nodes.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    for (const n of nodes) {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    }
  };
  sortRec(roots, 0);

  return roots;
}

/** Every descendant id of `docId`, used to stop a move creating a cycle in the UI. */
export function collectDescendantIds(tree: DocTreeNode[], docId: string): Set<string> {
  const out = new Set<string>();
  const find = (nodes: DocTreeNode[]): DocTreeNode | undefined => {
    for (const n of nodes) {
      if (n.id === docId) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
    return undefined;
  };
  const walk = (node: DocTreeNode) => {
    for (const c of node.children) {
      out.add(c.id);
      walk(c);
    }
  };
  const start = find(tree);
  if (start) walk(start);
  return out;
}

interface UseDocsOptions {
  /** Include soft-deleted docs. Default false. */
  includeDeleted?: boolean;
}

export function useDocs({ includeDeleted = false }: UseDocsOptions = {}) {
  const { currentWorkspace, currentUser } = useApp();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id;

  const queryKey = ['docs', workspaceId, { includeDeleted }];

  const { data: docs, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspaceId) return [];

      let query = supabase
        .from('docs')
        .select('*, collection:collection_id(id, name, icon, color, position)')
        .eq('workspace_id', workspaceId)
        .order('position');

      if (!includeDeleted) query = query.is('deleted_at', null);

      const { data, error } = await query;
      if (error) throw error;
      return data as Doc[];
    },
    enabled: !!workspaceId,
  });

  const invalidateDocs = () => {
    queryClient.invalidateQueries({ queryKey: ['docs'] });
  };

  const createMutation = useMutation({
    mutationFn: async (input: Partial<Doc>) => {
      if (!workspaceId) throw new Error('No workspace selected.');

      const { data, error } = await supabase
        .from('docs')
        .insert({
          workspace_id: workspaceId,
          collection_id: input.collection_id ?? null,
          parent_id: input.parent_id ?? null,
          team_id: input.team_id ?? null,
          title: input.title?.trim() || 'Untitled',
          content: input.content ?? '',
          content_text: input.content_text ?? '',
          icon: input.icon ?? null,
          visibility: input.visibility ?? 'workspace',
          status: input.status ?? 'draft',
          position: input.position ?? 0,
          created_by: currentUser?.id ?? null,
          updated_by: currentUser?.id ?? null,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as Doc;
    },
    onSuccess: invalidateDocs,
  });

  /**
   * Autosave calls this on a debounce, so it deliberately does NOT invalidate on every
   * success — refetching the whole tree mid-keystroke would fight the editor for the
   * cursor. The tree is invalidated only when something structural changes.
   */
  const saveMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Doc> & { id: string }) => {
      const { error } = await supabase
        .from('docs')
        .update({
          ...updates,
          updated_by: currentUser?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      // Patch the cached row in place so the tree label tracks a title edit without a
      // refetch.
      queryClient.setQueriesData<Doc[]>({ queryKey: ['docs'] }, prev =>
        (prev || []).map(d => (d.id === variables.id ? { ...d, ...variables } : d))
      );
      // The editor route reads ['doc', id], not the tree, and nothing patched or
      // invalidated it. A saved change therefore never reached the open document —
      // which is what made the visibility control look like it did not work.
      queryClient.setQueryData<Doc | null>(['doc', variables.id], prev =>
        prev ? { ...prev, ...variables } : prev
      );
    },
  });

  /** Structural changes (move, reparent, reorder) do refetch the tree. */
  const moveMutation = useMutation({
    mutationFn: async ({
      id, parent_id, collection_id, position,
    }: { id: string; parent_id?: string | null; collection_id?: string | null; position?: number }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (parent_id !== undefined) updates.parent_id = parent_id;
      if (collection_id !== undefined) updates.collection_id = collection_id;
      if (position !== undefined) updates.position = position;

      const { error } = await supabase.from('docs').update(updates).eq('id', id);

      if (error) {
        // The database refuses a move into the doc's own subtree. Say so plainly.
        if (/subtree|own parent|cycle/i.test(error.message)) {
          throw new Error('You cannot move a document inside itself.');
        }
        throw error;
      }
    },
    onSuccess: invalidateDocs,
  });

  /** Soft delete. A trigger carries the whole subtree down with it. */
  const trashMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('docs')
        .update({ deleted_at: new Date().toISOString(), deleted_by: currentUser?.id ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateDocs,
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('docs')
        .update({ deleted_at: null, deleted_by: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateDocs,
  });

  const deleteForeverMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('docs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateDocs,
  });

  const tree = buildDocTree(docs || []);

  return {
    docs,
    tree,
    isLoading,
    error,
    createDoc: createMutation.mutateAsync,
    saveDoc: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error,
    moveDoc: moveMutation.mutateAsync,
    trashDoc: trashMutation.mutateAsync,
    restoreDoc: restoreMutation.mutateAsync,
    deleteDocForever: deleteForeverMutation.mutateAsync,
    invalidateDocs,
  };
}

/** A single doc by id, kept separate so the editor route does not depend on the tree. */
export function useDoc(docId?: string) {
  const { currentWorkspace } = useApp();

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ['doc', docId],
    queryFn: async () => {
      if (!docId) return null;

      const { data, error } = await supabase
        .from('docs')
        .select('*, collection:collection_id(id, name, icon, color, position)')
        .eq('id', docId)
        .maybeSingle();

      if (error) throw error;
      return (data as Doc) ?? null;
    },
    enabled: !!docId && !!currentWorkspace,
  });

  return { doc, isLoading, error };
}
