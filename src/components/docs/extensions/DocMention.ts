import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { DocMentionMenu, DocMentionMenuRef } from '../DocMentionMenu';
import { LinkableDoc } from './DocLink';
import { MentionItem, MentionablePerson, buildMentionItems, toIsoDate } from './mentionItems';

export interface DocMentionOptions {
  /** Read fresh on every keystroke; the list arrives from a query after mount. */
  getDocs: () => LinkableDoc[];
  /** Excluded from the results — a document linking to itself helps nobody. */
  getCurrentDocId: () => string | undefined;
  /** Workspace members who can be tagged. */
  getPeople: () => MentionablePerson[];
}

// Suggestion() defaults to a plugin key named 'suggestion'. ProseMirror rejects two
// plugins sharing a key, so a second suggestion in the same editor throws at
// construction -- "Adding different instances of a keyed plugin". Every suggestion in
// this editor names its own key.
const docMentionPluginKey = new PluginKey('docMention');

/**
 * The `@` menu: tag a person, drop in a date, or link another document.
 *
 * Positioning and lifecycle are copied from SlashCommand rather than shared: the two
 * differ in what they insert and how they filter, and the ~40 lines they have in common
 * are TipTap's suggestion contract, which is not ours to abstract over.
 *
 * The document candidates are the RLS-filtered docs query, so it can only ever offer
 * documents the author can already read.
 */
export const DocMention = Extension.create<DocMentionOptions>({
  name: 'docMention',

  addOptions() {
    return {
      getDocs: () => [],
      getCurrentDocId: () => undefined,
      getPeople: () => [],
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      Suggestion<MentionItem>({
        editor: this.editor,
        pluginKey: docMentionPluginKey,
        char: '@',
        // Titles have spaces in them, but allowing them here would keep the menu open
        // across a whole sentence after a stray '@'. Matching on one word is the
        // narrower, more predictable behaviour.
        allowSpaces: false,
        startOfLine: false,

        items: ({ query }) => {
          const currentId = options.getCurrentDocId();
          return buildMentionItems({
            query,
            people: options.getPeople(),
            docs: options.getDocs().filter(doc => doc.id !== currentId),
          });
        },

        command: ({ editor, range, props }) => {
          const chain = editor.chain().focus().deleteRange(range);
          switch (props.kind) {
            case 'person':
              chain.insertDocPerson({ id: props.person.id, name: props.person.name }).run();
              break;
            case 'date':
              chain.insertDocDate(props.date).run();
              break;
            case 'pickDate':
              chain.insertDocDate(toIsoDate(new Date()), { openPicker: true }).run();
              break;
            case 'doc':
              chain.insertDocLink(props.doc.id).run();
              break;
          }
        },

        render: () => {
          let component: ReactRenderer<DocMentionMenuRef> | null = null;
          let el: HTMLDivElement | null = null;

          const place = (rect: (() => DOMRect | null) | null | undefined) => {
            if (!el || !rect) return;
            const r = rect();
            if (!r) return;

            const menuHeight = el.offsetHeight || 280;
            const spaceBelow = window.innerHeight - r.bottom;
            const flip = spaceBelow < menuHeight + 16;

            // Clamped so a caret near the right edge -- routine on a phone -- does not
            // push the menu off screen.
            const menuWidth = el.offsetWidth || 288;
            el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8))}px`;
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
              component = new ReactRenderer(DocMentionMenu, {
                props: {
                  items: props.items,
                  command: (item: MentionItem) => props.command(item),
                },
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
                command: (item: MentionItem) => props.command(item),
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
