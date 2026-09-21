import React, { useState } from 'react';
import { ChevronRight, Plus, FileText, Loader2 } from 'lucide-react';
import { DocCollection, DocTreeNode } from '../../types/database';

interface DocTreeProps {
  tree: DocTreeNode[];
  collections: DocCollection[];
  activeDocId?: string;
  isLoading?: boolean;
  canCreate: boolean;
  onSelect: (docId: string) => void;
  onCreate: (collectionId: string | null, parentId: string | null) => void;
}

interface RowProps {
  node: DocTreeNode;
  activeDocId?: string;
  canCreate: boolean;
  onSelect: (docId: string) => void;
  onCreate: (collectionId: string | null, parentId: string | null) => void;
}

const DocRow: React.FC<RowProps> = ({ node, activeDocId, canCreate, onSelect, onCreate }) => {
  // Ancestors of the open document start expanded; everything else starts collapsed.
  const [isExpanded, setIsExpanded] = useState(() => containsDoc(node, activeDocId));
  const hasChildren = node.children.length > 0;
  const isActive = node.id === activeDocId;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-sm pr-1 transition-colors ${
          isActive ? 'bg-bg-surface-hover' : 'hover:bg-bg-surface-hover'
        }`}
        style={{ paddingLeft: `${node.depth * 12}px` }}
      >
        <button
          type="button"
          onClick={() => setIsExpanded(v => !v)}
          // Keep the row aligned whether or not there are children to disclose.
          className={`p-0.5 rounded shrink-0 focus:outline-none ${
            hasChildren ? 'text-text-tertiary hover:text-text-primary' : 'invisible'
          }`}
          tabIndex={hasChildren ? 0 : -1}
          aria-hidden={!hasChildren}
        >
          <ChevronRight
            className={`w-3 h-3 transition-transform duration-200 ease-out motion-reduce:transition-none ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={`flex-1 min-w-0 flex items-center gap-1.5 py-1 text-left text-xs focus:outline-none ${
            isActive ? 'text-text-primary font-medium' : 'text-text-secondary'
          }`}
        >
          <span className="shrink-0 text-[13px] leading-none">
            {node.icon || <FileText className="w-3 h-3 text-text-tertiary" />}
          </span>
          <span className="truncate">{node.title || 'Untitled'}</span>
        </button>

        {canCreate && (
          <button
            type="button"
            title="Add a page inside"
            onClick={() => { setIsExpanded(true); onCreate(node.collection_id, node.id); }}
            className="p-0.5 rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-primary transition-opacity focus:outline-none focus:opacity-100"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>

      {hasChildren && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            {node.children.map(child => (
              <DocRow
                key={child.id}
                node={child}
                activeDocId={activeDocId}
                canCreate={canCreate}
                onSelect={onSelect}
                onCreate={onCreate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function containsDoc(node: DocTreeNode, docId?: string): boolean {
  if (!docId) return false;
  if (node.id === docId) return true;
  return node.children.some(child => containsDoc(child, docId));
}

/**
 * Collections down the left, documents nested inside them.
 *
 * Grouping is by the ROOT document's collection: a child page lives under its parent
 * wherever that parent sits, so moving a parent moves its subtree visually without
 * touching every descendant's collection_id.
 */
export const DocTree: React.FC<DocTreeProps> = ({
  tree, collections, activeDocId, isLoading, canCreate, onSelect, onCreate,
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const uncategorized = tree.filter(n => !n.collection_id);

  const groups: { key: string; label: string; color?: string; nodes: DocTreeNode[] }[] = [
    ...collections.map(c => ({
      key: c.id,
      label: c.name,
      color: c.color,
      nodes: tree.filter(n => n.collection_id === c.id),
    })),
    ...(uncategorized.length > 0
      ? [{ key: '__none__', label: 'Uncategorized', nodes: uncategorized }]
      : []),
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="space-y-3 py-3">
      {groups.map(group => {
        const isCollapsed = collapsed.has(group.key);
        return (
          <div key={group.key}>
            <div className="group flex items-center gap-1 px-2">
              <button
                type="button"
                onClick={() => toggle(group.key)}
                className="flex-1 min-w-0 flex items-center gap-1.5 py-1 text-left focus:outline-none"
              >
                <ChevronRight
                  className={`w-3 h-3 text-text-tertiary shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                    isCollapsed ? '' : 'rotate-90'
                  }`}
                />
                {group.color && (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                )}
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary truncate">
                  {group.label}
                </span>
              </button>

              {canCreate && group.key !== '__none__' && (
                <button
                  type="button"
                  title={`New page in ${group.label}`}
                  onClick={() => onCreate(group.key, null)}
                  className="p-0.5 rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-primary transition-opacity focus:outline-none focus:opacity-100"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>

            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
              }`}
            >
              <div className="overflow-hidden">
                <div className="mt-0.5 px-1">
                  {group.nodes.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-text-tertiary italic">Empty</p>
                  ) : (
                    group.nodes.map(node => (
                      <DocRow
                        key={node.id}
                        node={node}
                        activeDocId={activeDocId}
                        canCreate={canCreate}
                        onSelect={onSelect}
                        onCreate={onCreate}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
