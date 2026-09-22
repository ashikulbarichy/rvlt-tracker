import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import {
  Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Code2,
  Quote, Minus, Table as TableIcon, Info, AlertTriangle, CheckCircle2, Type, Clapperboard,
} from 'lucide-react';
import { DocSlashMenu, DocSlashMenuRef, SlashItem } from '../DocSlashMenu';

const ITEMS: SlashItem[] = [
  { title: 'Text', hint: 'Plain paragraph', icon: Type,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run() },
  { title: 'Heading 1', hint: 'Section title', icon: Heading1,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run() },
  { title: 'Heading 2', hint: 'Subsection', icon: Heading2,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run() },
  { title: 'Heading 3', hint: 'Minor heading', icon: Heading3,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run() },
  { title: 'Bullet list', hint: 'Unordered list', icon: List,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: 'Numbered list', hint: 'Ordered list', icon: ListOrdered,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: 'Checklist', hint: 'Tickable tasks', icon: ListChecks,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run() },
  { title: 'Table', hint: '3x3 with header row', icon: TableIcon,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range)
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: 'Code block', hint: 'Syntax highlighted', icon: Code2,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { title: 'Quote', hint: 'Blockquote', icon: Quote,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { title: 'Divider', hint: 'Horizontal rule', icon: Minus,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
  { title: 'Script', hint: 'Spoken lines, typewriter face', icon: Clapperboard,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setScriptBlock().run() },
  { title: 'Info callout', hint: 'Boxed aside', icon: Info,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout('info').run() },
  { title: 'Warning callout', hint: 'Boxed warning', icon: AlertTriangle,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout('warning').run() },
  { title: 'Success callout', hint: 'Boxed confirmation', icon: CheckCircle2,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout('success').run() },
];

/**
 * The `/` block menu.
 *
 * Positioning is hand-rolled against `clientRect` rather than using a popper library:
 * the app has no tooltip dependency, and one fixed-position div is cheaper than adding
 * one. The menu flips above the caret when it would otherwise run off the bottom.
 */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        // Only at the start of an empty-ish block, so "and/or" mid-sentence does not
        // open the menu.
        allowSpaces: false,
        startOfLine: false,

        items: ({ query }) =>
          ITEMS.filter(item =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.hint.toLowerCase().includes(query.toLowerCase())
          ),

        command: ({ editor, range, props }) => props.run({ editor, range }),

        render: () => {
          let component: ReactRenderer<DocSlashMenuRef> | null = null;
          let el: HTMLDivElement | null = null;

          const place = (rect: (() => DOMRect | null) | null | undefined) => {
            if (!el || !rect) return;
            const r = rect();
            if (!r) return;

            const menuHeight = el.offsetHeight || 280;
            const spaceBelow = window.innerHeight - r.bottom;
            const flip = spaceBelow < menuHeight + 16;

            el.style.left = `${r.left}px`;
            el.style.top = flip ? `${r.top - menuHeight - 8}px` : `${r.bottom + 8}px`;
          };

          const destroy = () => {
            component?.destroy();
            el?.remove();
            component = null;
            el = null;
          };

          return {
            onStart: props => {
              component = new ReactRenderer(DocSlashMenu, {
                props: { items: props.items, command: (item: SlashItem) => props.command(item) },
                editor: props.editor,
              });

              el = document.createElement('div');
              el.style.position = 'fixed';
              el.style.zIndex = '60';
              el.appendChild(component.element);
              document.body.appendChild(el);

              place(props.clientRect);
            },

            onUpdate: props => {
              component?.updateProps({
                items: props.items,
                command: (item: SlashItem) => props.command(item),
              });
              place(props.clientRect);
            },

            onKeyDown: props => {
              if (props.event.key === 'Escape') {
                destroy();
                return true;
              }
              return component?.ref?.onKeyDown({ event: props.event }) ?? false;
            },

            onExit: destroy,
          };
        },
      }),
    ];
  },
});
