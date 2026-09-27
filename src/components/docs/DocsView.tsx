import React, { useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';

import { useApp } from '../../context/AppContext';
import { useDocs } from '../../hooks/useDocs';
import { useDocCollections } from '../../hooks/useDocCollections';
import { DocTemplate } from '../../types/database';
import { SidebarToggle } from '../layout/SidebarToggle';
import { DocTree } from './DocTree';
import { TemplatePicker } from './TemplatePicker';

/**
 * The docs shell. At lg+ two cards beside the app sidebar: the document list, and the
 * open document. Below lg they are separate screens: the list at /docs, the document
 * full screen at /docs/:docId with a back link.
 */
export const DocsView: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceSlug, docId } = useParams<{ workspaceSlug: string; docId?: string }>();
  const { currentWorkspace } = useApp();

  const { tree, isLoading, error, createDoc } = useDocs();
  const { collections } = useDocCollections();

  const [isPickerOpen, setIsPickerOpen] = useState(false);
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
    <div className="flex-1 flex min-w-0 overflow-hidden lg:gap-1.5">
      {/* Card 2 of 3 (after the app sidebar): the document list. Below lg it is the
          whole page at /docs and hidden once a document is open. */}
      <aside
        className={`${docId ? 'hidden lg:flex' : 'flex'} flex-col flex-1 lg:flex-none lg:w-64 min-w-0 bg-bg-surface lg:rounded-lg lg:shadow-sm overflow-hidden`}
      >
        <div className="shrink-0 px-3 sm:px-6 lg:px-3 py-2.5 sm:py-3 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <SidebarToggle showNewTicket={false} />
            <h1 className="text-base font-karla font-semibold text-text-primary">Docs</h1>
          </div>
          {canCreate && (
            <button
              type="button"
              title="New document"
              onClick={() => openPicker(null, null)}
              className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary bg-bg-surface-raised hover:bg-bg-surface-hover transition-colors focus:outline-none"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-1 sm:px-3 lg:px-0 pb-6">
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

      {/* Card 3: the open document. */}
      <section
        className={`${docId ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 bg-bg-surface lg:rounded-lg lg:shadow-sm overflow-hidden`}
      >
        {docId ? (
          <Outlet />
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <FileText className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
              <h2 className="text-sm font-semibold text-text-primary">No document open</h2>
              <p className="text-xs text-text-tertiary mt-1">
                Pick one from the list, or start a new page from a template.
              </p>
            </div>
          </div>
        )}
      </section>

      <TemplatePicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onPick={handlePick}
      />
    </div>
  );
};
