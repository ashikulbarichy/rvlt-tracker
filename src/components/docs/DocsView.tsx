import React, { useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { Plus, FileText, PanelLeftClose, PanelLeft } from 'lucide-react';

import { useApp } from '../../context/AppContext';
import { useDocs } from '../../hooks/useDocs';
import { useDocCollections } from '../../hooks/useDocCollections';
import { DocTemplate } from '../../types/database';
import { SidebarToggle } from '../layout/SidebarToggle';
import { DocTree } from './DocTree';
import { TemplatePicker } from './TemplatePicker';

/**
 * The docs shell: collection tree on the left, the open document on the right.
 *
 * A layout route rather than two sibling routes, so the tree keeps its expand state
 * when you move between documents.
 */
export const DocsView: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceSlug, docId } = useParams<{ workspaceSlug: string; docId?: string }>();
  const { currentWorkspace } = useApp();

  const { tree, isLoading, error, createDoc } = useDocs();
  const { collections } = useDocCollections();

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isTreeOpen, setIsTreeOpen] = useState(true);
  // Where a doc created from the picker will land.
  const [target, setTarget] = useState<{ collectionId: string | null; parentId: string | null }>({
    collectionId: null,
    parentId: null,
  });

  const canCreate = !!currentWorkspace;

  const openPicker = (collectionId: string | null, parentId: string | null) => {
    setTarget({ collectionId, parentId });
    setIsPickerOpen(true);
  };

  const handlePick = async (template: DocTemplate | null) => {
    // The plain-text mirror is derived from the template's HTML here rather than left
    // empty, so a document created from a template is searchable before it is opened.
    const html = template?.content || '';
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    const created = await createDoc({
      title: template ? template.name : 'Untitled',
      content: html,
      content_text: text,
      collection_id: target.collectionId,
      parent_id: target.parentId,
      icon: template ? '📄' : null,
    });

    setIsPickerOpen(false);
    navigate(`/${workspaceSlug}/docs/${created.id}`);
  };

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden">
      <aside
        aria-hidden={!isTreeOpen}
        className={`shrink-0 bg-bg-surface overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none ${
          isTreeOpen ? 'w-64 border-r border-border' : 'w-0 border-r-0'
        }`}
      >
        <div className="w-64 h-full overflow-y-auto no-scrollbar">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2.5 bg-bg-surface border-b border-border">
              <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                <SidebarToggle />
                Docs
              </span>
              <div className="flex items-center gap-0.5">
                {canCreate && (
                  <button
                    type="button"
                    title="New document"
                    onClick={() => openPicker(null, null)}
                    className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors focus:outline-none"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  title="Hide sidebar"
                  tabIndex={isTreeOpen ? 0 : -1}
                  onClick={() => setIsTreeOpen(false)}
                  className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors focus:outline-none"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {error && (
              <div className="m-2 text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
                {(error as { message?: string }).message || 'Could not load documents.'}
              </div>
            )}

            <DocTree
              tree={tree}
              collections={collections || []}
              activeDocId={docId}
              isLoading={isLoading}
              canCreate={canCreate}
              onSelect={id => navigate(`/${workspaceSlug}/docs/${id}`)}
              onCreate={openPicker}
            />
        </div>
      </aside>

      <div
        aria-hidden={isTreeOpen}
        className={`self-start shrink-0 flex items-center gap-1 overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none ${
          isTreeOpen ? 'w-0 m-0 opacity-0' : 'w-8 lg:w-20 m-2 opacity-100'
        }`}
      >
        <SidebarToggle />
        <button
          type="button"
          title="Show documents"
          tabIndex={isTreeOpen ? -1 : 0}
          onClick={() => setIsTreeOpen(true)}
          className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary bg-bg-surface-raised hover:bg-bg-surface-hover transition-colors focus:outline-none"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>

      {docId ? (
        <Outlet />
      ) : (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <FileText className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
            <h2 className="text-sm font-semibold text-text-primary">No document open</h2>
            <p className="text-xs text-text-tertiary mt-1">
              Pick one from the sidebar, or start a new page from a template.
            </p>
            {canCreate && (
              <button
                type="button"
                onClick={() => openPicker(null, null)}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium bg-accent-primary text-white rounded-md px-3 py-1.5 hover:opacity-90 transition-opacity focus:outline-none"
              >
                <Plus className="w-3.5 h-3.5" />
                New document
              </button>
            )}
          </div>
        </div>
      )}

      <TemplatePicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onPick={handlePick}
      />
    </div>
  );
};
