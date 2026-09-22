import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { FileText } from 'lucide-react';
import { LinkableDoc } from './extensions/DocLink';

interface DocMentionMenuProps {
  items: LinkableDoc[];
  command: (item: LinkableDoc) => void;
}

export interface DocMentionMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/**
 * The list shown by the `@` menu.
 *
 * Only documents the author can currently read are ever in `items` — the list comes
 * from the RLS-filtered docs query — so you cannot link to something you cannot see.
 * Mirrors DocSlashMenu: selection and keys here, positioning and lifecycle in the
 * extension, because TipTap's suggestion plugin owns both.
 */
export const DocMentionMenu = forwardRef<DocMentionMenuRef, DocMentionMenuProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;

        if (event.key === 'ArrowUp') {
          setSelected((selected + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelected((selected + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          command(items[selected]);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-72 bg-bg-surface-raised border border-border rounded-md shadow-lg p-2">
          <p className="px-2 py-1.5 text-xs text-text-tertiary">No documents match.</p>
        </div>
      );
    }

    return (
      <div className="w-72 max-h-72 overflow-y-auto bg-bg-surface-raised border border-border rounded-md shadow-lg p-1.5 space-y-0.5">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onMouseEnter={() => setSelected(index)}
            onClick={() => command(item)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs rounded-sm transition-colors ${
              index === selected
                ? 'bg-bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
            }`}
          >
            {item.icon
              ? <span className="shrink-0 text-sm leading-none">{item.icon}</span>
              : <FileText className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />}
            <span className="truncate">{item.title || 'Untitled'}</span>
          </button>
        ))}
      </div>
    );
  }
);

DocMentionMenu.displayName = 'DocMentionMenu';
