import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Calendar, CalendarPlus, FileText } from 'lucide-react';
import { MentionItem, formatDocDate } from './extensions/mentionItems';

interface DocMentionMenuProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export interface DocMentionMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const GROUP_LABEL: Record<MentionItem['kind'], string> = {
  person: 'People',
  date: 'Dates',
  pickDate: 'Dates',
  doc: 'Documents',
};

function itemKey(item: MentionItem): string {
  switch (item.kind) {
    case 'person': return `person:${item.person.id}`;
    case 'date': return `date:${item.date}`;
    case 'pickDate': return 'pickDate';
    case 'doc': return `doc:${item.doc.id}`;
  }
}

function avatarFor(name: string, url: string | null): string {
  return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=282828&color=B3B3B3&rounded=true`;
}

/**
 * The list shown by the `@` menu: people, then dates, then documents.
 *
 * Only documents the author can currently read are ever in `items` — the list comes
 * from the RLS-filtered docs query — so you cannot link to something you cannot see.
 * Mirrors DocSlashMenu: selection and keys here, positioning and lifecycle in the
 * extension, because TipTap's suggestion plugin owns both.
 */
export const DocMentionMenu = forwardRef<DocMentionMenuRef, DocMentionMenuProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => setSelected(0), [items]);

    // Arrow keys can move the selection past the scrolled area.
    useEffect(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

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
        <div className="w-72 bg-bg-surface-raised border border-border rounded-md shadow-lg p-2">
          <p className="px-2 py-1.5 text-xs text-text-tertiary">
            No people, dates or documents match.
          </p>
        </div>
      );
    }

    return (
      <div
        ref={listRef}
        className="w-72 max-h-80 overflow-y-auto bg-bg-surface-raised border border-border rounded-md shadow-lg p-1.5"
      >
        {items.map((item, index) => {
          const group = GROUP_LABEL[item.kind];
          const showHeader = index === 0 || GROUP_LABEL[items[index - 1].kind] !== group;

          return (
            <React.Fragment key={itemKey(item)}>
              {showHeader && (
                <p className={`px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-text-tertiary ${index === 0 ? 'pt-1' : 'pt-2.5'}`}>
                  {group}
                </p>
              )}
              <button
                type="button"
                data-index={index}
                onMouseEnter={() => setSelected(index)}
                // mousedown, not click: keeps focus in the editor so the suggestion
                // range is still valid when the command runs.
                onMouseDown={event => {
                  event.preventDefault();
                  command(item);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs rounded-sm transition-colors ${
                  index === selected
                    ? 'bg-bg-surface-hover text-text-primary'
                    : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
                }`}
              >
                <MentionRow item={item} />
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  }
);

DocMentionMenu.displayName = 'DocMentionMenu';

const MentionRow: React.FC<{ item: MentionItem }> = ({ item }) => {
  switch (item.kind) {
    case 'person':
      return (
        <>
          <img
            src={avatarFor(item.person.name, item.person.avatarUrl)}
            alt=""
            className="w-4 h-4 shrink-0 rounded-full object-cover"
          />
          <span className="truncate">{item.person.name}</span>
          {item.person.email && item.person.email !== item.person.name && (
            <span className="ml-auto pl-2 truncate text-[10px] text-text-tertiary">{item.person.email}</span>
          )}
        </>
      );
    case 'date':
      return (
        <>
          <Calendar className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />
          <span className="truncate">{formatDocDate(item.date)}</span>
          <span className="ml-auto pl-2 shrink-0 text-[10px] text-text-tertiary">{item.hint}</span>
        </>
      );
    case 'pickDate':
      return (
        <>
          <CalendarPlus className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />
          <span className="truncate">Pick a date…</span>
        </>
      );
    case 'doc':
      return (
        <>
          {item.doc.icon
            ? <span className="shrink-0 text-sm leading-none">{item.doc.icon}</span>
            : <FileText className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />}
          <span className="truncate">{item.doc.title || 'Untitled'}</span>
        </>
      );
  }
};
