import React, { useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { DocTemplate } from '../../types/database';
import { useDocTemplates } from '../../hooks/useDocTemplates';

interface TemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** `null` means "blank document". */
  onPick: (template: DocTemplate | null) => Promise<void> | void;
}

/**
 * Template chooser shown when creating a document.
 *
 * Blank is offered first and deliberately looks like the others: starting from structure
 * should be the easy path, but never the forced one.
 */
export const TemplatePicker: React.FC<TemplatePickerProps> = ({ isOpen, onClose, onPick }) => {
  const { templates, byCategory, isLoading } = useDocTemplates();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const choose = async (template: DocTemplate | null) => {
    setError(null);
    setBusyId(template?.id || '__blank__');
    try {
      await onPick(template);
    } catch (err: unknown) {
      const e = err as { message?: string } | null;
      setError(e?.message || 'Could not create the document.');
    } finally {
      setBusyId(null);
    }
  };

  const categories = Object.keys(byCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-[10vh] px-3 sm:px-4 bg-black/50">
      <div className="w-full max-w-2xl max-h-[92vh] sm:max-h-[75vh] flex flex-col bg-bg-surface border border-border rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">New document</h2>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              Start from a template, or from nothing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-text-tertiary hover:text-text-primary transition-colors focus:outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2 shrink-0">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => choose(null)}
            className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-md border border-border hover:bg-bg-surface-hover transition-colors focus:outline-none disabled:opacity-60"
          >
            {busyId === '__blank__'
              ? <Loader2 className="w-4 h-4 animate-spin text-text-tertiary shrink-0" />
              : <FileText className="w-4 h-4 text-text-tertiary shrink-0" />}
            <span>
              <span className="block text-xs font-medium text-text-primary">Blank document</span>
              <span className="block text-[11px] text-text-tertiary">Start from an empty page</span>
            </span>
          </button>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" />
            </div>
          )}

          {!isLoading && (templates || []).length === 0 && (
            <p className="text-xs text-text-tertiary py-4">
              No templates yet. An admin can add them in Workspace Settings.
            </p>
          )}

          {categories.map(category => (
            <div key={category}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                {category}
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {byCategory[category].map(template => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => choose(template)}
                    className="text-left px-3 py-2.5 rounded-md border border-border hover:bg-bg-surface-hover transition-colors focus:outline-none disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      {busyId === template.id && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-text-tertiary shrink-0" />
                      )}
                      <span className="text-xs font-medium text-text-primary truncate">
                        {template.name}
                      </span>
                    </span>
                    {template.description && (
                      <span className="block text-[11px] text-text-tertiary mt-1 line-clamp-2">
                        {template.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
