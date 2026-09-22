import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, Check, Trash2, Globe, Users, Lock } from 'lucide-react';
import { Doc, DocVisibility } from '../../types/database';
import { CustomSelect } from '../common/CustomSelect';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface DocHeaderProps {
  doc: Doc;
  /** Root-first ancestors, excluding the doc itself. */
  ancestors: Doc[];
  canEdit: boolean;
  /** Only the author may set 'private' — the docs_guard_visibility trigger agrees. */
  isAuthor: boolean;
  /** Author or workspace admin: may change visibility and manage shares. */
  canManageAccess: boolean;
  saveState: SaveState;
  saveError?: string | null;
  onTitleChange: (title: string) => void;
  onIconChange: (icon: string | null) => void;
  onVisibilityChange: (visibility: DocVisibility) => void;
  /** Rendered under the visibility row when the document is restricted. */
  sharePanel?: React.ReactNode;
  onTrash: () => void;
  onBreadcrumbClick: (docId: string) => void;
}

const VISIBILITY_ICON: Record<DocVisibility, typeof Globe> = {
  workspace: Globe,
  restricted: Users,
  private: Lock,
};

/** A small, deliberately boring set — a full emoji picker is its own dependency. */
const ICONS = ['📄', '📘', '📐', '🧭', '🛠️', '🚀', '🔒', '📊', '🧪', '🗺️', '⚙️', '💡', '🔥', '✅'];

export const DocHeader: React.FC<DocHeaderProps> = ({
  doc,
  ancestors,
  canEdit,
  isAuthor,
  canManageAccess,
  saveState,
  saveError,
  onTitleChange,
  onIconChange,
  onVisibilityChange,
  sharePanel,
  onTrash,
  onBreadcrumbClick,
}) => {
  const [isIconOpen, setIsIconOpen] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isIconOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (iconRef.current && !iconRef.current.contains(e.target as Node)) setIsIconOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isIconOpen]);

  const VisibilityIcon = VISIBILITY_ICON[doc.visibility];

  /**
   * Only what this person can actually save, so a choice never fails at the database.
   * The current visibility is always listed, otherwise the select would render the
   * wrong label for the document it is describing.
   */
  const visibilityOptions = React.useMemo(() => {
    const options = [
      { value: 'workspace', label: 'Everyone in the workspace' },
      { value: 'restricted', label: 'Specific people and teams' },
    ];
    // Only the author may set 'private' — the same rule the docs_guard_visibility
    // trigger enforces. Listing it for anyone else offers a choice that would be
    // refused with an error.
    if (isAuthor || doc.visibility === 'private') {
      options.push({ value: 'private', label: 'Only me' });
    }
    return options;
  }, [doc.visibility, isAuthor]);

  return (
    <div className="space-y-3">
      {ancestors.length > 0 && (
        <div className="flex items-center flex-wrap gap-0.5 text-[11px] text-text-tertiary">
          {ancestors.map(ancestor => (
            <React.Fragment key={ancestor.id}>
              <button
                type="button"
                onClick={() => onBreadcrumbClick(ancestor.id)}
                className="hover:text-text-secondary transition-colors focus:outline-none truncate max-w-[12rem]"
              >
                {ancestor.icon ? `${ancestor.icon} ` : ''}{ancestor.title}
              </button>
              <ChevronRight className="w-3 h-3 shrink-0" />
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="relative" ref={iconRef}>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setIsIconOpen(v => !v)}
            title={canEdit ? 'Change icon' : undefined}
            className="text-3xl leading-none hover:opacity-70 transition-opacity focus:outline-none disabled:hover:opacity-100"
          >
            {doc.icon || '📄'}
          </button>

          {isIconOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 w-56 grid grid-cols-7 gap-1 bg-bg-surface-raised border border-border rounded-md shadow-lg p-2">
              {ICONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => { onIconChange(icon); setIsIconOpen(false); }}
                  className="text-lg rounded hover:bg-bg-surface-hover transition-colors focus:outline-none"
                >
                  {icon}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { onIconChange(null); setIsIconOpen(false); }}
                title="Clear icon"
                className="col-span-7 mt-1 text-[10px] text-text-tertiary hover:text-text-secondary focus:outline-none"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Uncontrolled: a controlled input would fight the debounced save for the
            caret on every keystroke. */}
        <input
          key={doc.id}
          type="text"
          defaultValue={doc.title}
          disabled={!canEdit}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="Untitled"
          className="flex-1 min-w-0 bg-transparent text-2xl font-semibold text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:cursor-default"
        />

        <div className="flex items-center gap-2 pt-1.5 shrink-0">
          <span className="text-[11px] text-text-tertiary flex items-center gap-1 min-w-[4.5rem] justify-end">
            {saveState === 'saving' && (<><Loader2 className="w-3 h-3 animate-spin" />Saving…</>)}
            {saveState === 'saved' && (<><Check className="w-3 h-3" />Saved</>)}
            {saveState === 'error' && (<span className="text-status-error">Not saved</span>)}
          </span>

          {canEdit && (
            <button
              type="button"
              onClick={onTrash}
              title="Move to trash"
              className="p-1.5 rounded text-text-tertiary hover:text-status-error transition-colors focus:outline-none"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <VisibilityIcon className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        <CustomSelect
          value={doc.visibility}
          onChange={val => onVisibilityChange(val as DocVisibility)}
          options={visibilityOptions}
          disabled={!canManageAccess}
          size="sm"
          className="w-56"
        />
      </div>

      {doc.visibility === 'restricted' && sharePanel}

      {canEdit && !canManageAccess && (
        <p className="text-[11px] text-text-tertiary">
          Only the author or a workspace admin can change who this document is shared
          with.
        </p>
      )}

      {saveError && (
        <div className="text-xs text-status-error bg-status-error/10 border border-status-error/30 rounded-md px-3 py-2">
          {saveError}
        </div>
      )}
    </div>
  );
};
