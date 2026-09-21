import React from 'react';
import { Loader2, Plus, Trash2, Pencil, X, FileText } from 'lucide-react';
import { useDocTemplates } from '../../hooks/useDocTemplates';
import { useDocCollections } from '../../hooks/useDocCollections';
import { DocTemplate } from '../../types/database';
import { CustomSelect } from '../common/CustomSelect';

// Settings ships in the main bundle, so a static import here would drag the whole
// editor stack back in and defeat the lazy docs route.
const DocEditor = React.lazy(() =>
  import('../docs/DocEditor').then(m => ({ default: m.DocEditor }))
);

interface WorkspaceDocTemplateSettingsProps {
  /** Non-admins see the list read-only; RLS enforces this independently. */
  canEdit?: boolean;
}

/**
 * Manage the workspace's document templates.
 *
 * Content is edited in the same `DocEditor` documents use, so what an admin builds here
 * is exactly what a new document gets — no second editor to keep in sync.
 */
export const WorkspaceDocTemplateSettings: React.FC<WorkspaceDocTemplateSettingsProps> = ({
  canEdit = false,
}) => {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate } = useDocTemplates();
  const { collections } = useDocCollections();

  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<DocTemplate | null>(null);
  const [draft, setDraft] = React.useState<{ html: string; text: string }>({ html: '', text: '' });
  const [newName, setNewName] = React.useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  const run = async (id: string | null, fn: () => Promise<void>) => {
    if (!canEdit) return;
    setError(null);
    setBusyId(id);
    try {
      await fn();
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setError(e?.message || 'That change could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  const categoryOptions = [
    ...new Set([...(collections || []).map(c => c.name), 'General']),
  ].map(name => ({ value: name, label: name }));

  const openEditor = (template: DocTemplate) => {
    setEditing(template);
    setDraft({ html: template.content, text: '' });
  };

  const saveContent = async () => {
    if (!editing) return;
    await run(editing.id, async () => {
      await updateTemplate(editing.id, { content: draft.html });
      setEditing(null);
    });
  };

  return (
    <div className="space-y-4 pt-8 border-t border-border">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Document templates</h3>
        <p className="text-xs text-text-tertiary mt-1">
          {canEdit
            ? 'Shared across the workspace. Built-in templates can be edited or removed like any other.'
            : 'Templates are shared across the workspace. Only admins can change them.'}
        </p>
      </div>

      {error && (
        <div className="text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {(templates || []).map(template => {
          const isBusy = busyId === template.id;
          return (
            <div
              key={template.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-bg-surface-raised border border-transparent rounded-lg"
            >
              {/* Same identity/controls split as the status and ticket-type rows above:
                  name on top, supporting text beneath, controls right-aligned. */}
              <div className="flex items-center space-x-3 min-w-0">
                <FileText className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                <div className="min-w-0">
                  {canEdit ? (
                    <input
                      type="text"
                      defaultValue={template.name}
                      disabled={isBusy}
                      onBlur={e => {
                        const name = e.target.value.trim();
                        if (!name || name === template.name) {
                          e.target.value = template.name;
                          return;
                        }
                        run(template.id, () => updateTemplate(template.id, { name }));
                      }}
                      className="w-full text-sm font-medium text-text-primary bg-transparent border border-transparent rounded px-1 -ml-1 hover:border-border focus:outline-none focus:border-text-secondary"
                    />
                  ) : (
                    <div className="text-sm font-medium text-text-primary">{template.name}</div>
                  )}

                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                      {template.is_builtin ? 'Built-in' : 'Custom'}
                    </span>
                    {template.description && (
                      <span className="text-[10px] text-text-tertiary truncate">
                        · {template.description}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <CustomSelect
                  value={template.category}
                  onChange={val => run(template.id, () => updateTemplate(template.id, { category: val }))}
                  options={categoryOptions}
                  size="sm"
                  className="w-40"
                />

                <span className="w-px h-5 bg-border" aria-hidden="true" />

                <button
                  type="button"
                  title="Edit content"
                  disabled={!canEdit || isBusy}
                  onClick={() => openEditor(template)}
                  className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors focus:outline-none disabled:opacity-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  title="Delete template"
                  disabled={!canEdit || isBusy}
                  onClick={() => run(template.id, () => deleteTemplate(template.id))}
                  className="p-1 rounded text-text-tertiary hover:text-status-error transition-colors focus:outline-none disabled:opacity-50"
                >
                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-bg-surface-raised border border-dashed border-border rounded-lg">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <FileText className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (newName.trim()) {
                    run(null, async () => {
                      await createTemplate({ name: newName, category: 'General' });
                      setNewName('');
                    });
                  }
                }
              }}
              placeholder="New template name…"
              className="w-full text-sm font-medium text-text-primary bg-transparent border border-transparent rounded px-1 -ml-1 placeholder:font-normal placeholder:text-text-tertiary hover:border-border focus:outline-none focus:border-text-secondary"
            />
          </div>

          <button
            type="button"
            disabled={!newName.trim() || busyId !== null}
            onClick={() =>
              run(null, async () => {
                await createTemplate({ name: newName, category: 'General' });
                setNewName('');
              })
            }
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium bg-accent-primary text-white rounded-md px-3 py-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity focus:outline-none"
          >
            <Plus className="w-3.5 h-3.5" />
            Add template
          </button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4 bg-black/50">
          <div className="w-full max-w-3xl max-h-[80vh] flex flex-col bg-bg-surface border border-border rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <h4 className="text-sm font-semibold text-text-primary">{editing.name}</h4>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <React.Suspense
                fallback={<div className="text-xs text-text-tertiary py-8 text-center">Loading editor…</div>}
              >
                <DocEditor
                  key={editing.id}
                  content={editing.content}
                  onChange={(html, text) => setDraft({ html, text })}
                />
              </React.Suspense>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-xs text-text-secondary hover:text-text-primary px-3 py-1.5 focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveContent}
                disabled={busyId === editing.id}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-primary text-white rounded-md px-3 py-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity focus:outline-none"
              >
                {busyId === editing.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
