import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Editor, Range } from '@tiptap/core';

export interface SlashItem {
  title: string;
  hint: string;
  icon: LucideIcon;
  /** Applied to the editor, with the typed "/query" already removed. */
  run: (args: { editor: Editor; range: Range }) => void;
}

interface DocSlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface DocSlashMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/**
 * The list shown by the `/` menu.
 *
 * Owns only selection and keyboard handling — positioning and lifecycle live in the
 * SlashCommand extension, because TipTap's suggestion plugin controls both.
 */
export const DocSlashMenu = forwardRef<DocSlashMenuRef, DocSlashMenuProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    // Any change to the result set invalidates the highlighted row.
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
        if (event.key === 'Enter' || event.key === 'Tab') {
          command(items[selected]);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="min-w-[16rem] bg-bg-surface-raised border border-border rounded-md shadow-lg p-2">
          <span className="text-xs text-text-tertiary">No matching blocks</span>
        </div>
      );
    }

    return (
      <div className="min-w-[16rem] max-h-72 overflow-y-auto bg-bg-surface-raised border border-border rounded-md shadow-lg p-1.5 space-y-0.5">
        {items.map((item, index) => {
          const Icon = item.icon;
          const isSelected = index === selected;
          return (
            <button
              key={item.title}
              type="button"
              // mousedown, not click: click fires after the editor has already lost the
              // selection the command needs.
              onMouseDown={e => {
                e.preventDefault();
                command(item);
              }}
              onMouseEnter={() => setSelected(index)}
              className={`w-full text-left px-2.5 py-1.5 rounded-sm flex items-center gap-2.5 transition-colors ${
                isSelected
                  ? 'bg-bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-bg-surface-hover'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0 text-text-tertiary" />
              <span className="min-w-0">
                <span className="block text-xs font-medium truncate">{item.title}</span>
                <span className="block text-[10px] text-text-tertiary truncate">{item.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }
);

DocSlashMenu.displayName = 'DocSlashMenu';
