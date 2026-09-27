import { Node, mergeAttributes } from '@tiptap/core';
import type { MentionablePerson } from './mentionItems';

export interface DocPersonOptions {
  /** Workspace members, read fresh on every render — the list arrives from a query. */
  getPeople: () => MentionablePerson[];
  getCurrentUserId: () => string | undefined;
}

export interface NodeViewRegistry {
  /** Live node views' render functions, so the editor can re-render them when data lands. */
  renderers: Set<() => void>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docPerson: {
      insertDocPerson: (person: { id: string; name: string }) => ReturnType;
    };
  }
  interface Storage {
    docPerson: NodeViewRegistry;
  }
}

/**
 * An inline tag of a workspace member: `@Name`.
 *
 * Stores the user's id plus their name at the time of tagging. The id is what counts:
 * the chip shows the member's CURRENT name, so a rename updates every tag. The stored
 * name is a fallback for someone who has since left the workspace, and is what lands
 * in the plain-text mirror so a search for a person finds the notes that tag them.
 *
 * Unlike DocLink there is nothing to hide here: every reader of a document is a member
 * of its workspace and can already see the member list.
 */
export const DocPerson = Node.create<DocPersonOptions>({
  name: 'docPerson',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      getPeople: () => [],
      getCurrentUserId: () => undefined,
    };
  },

  addStorage() {
    return { renderers: new Set<() => void>() };
  },

  addAttributes() {
    return {
      userId: {
        default: null,
        parseHTML: element => element.getAttribute('data-user-id'),
        renderHTML: attributes =>
          attributes.userId ? { 'data-user-id': attributes.userId } : {},
      },
      label: {
        default: '',
        parseHTML: element => element.getAttribute('data-label') || '',
        renderHTML: attributes => (attributes.label ? { 'data-label': attributes.label } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-user-id]' }];
  },

  // Both serialisers write the member's CURRENT name where it is known, so saving a
  // document after a rename refreshes the stored fallback and the search text with it.
  renderHTML({ node, HTMLAttributes }) {
    const name = this.options.getPeople().find(p => p.id === node.attrs.userId)?.name
      || node.attrs.label || 'member';
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'doc-person', 'data-label': name }),
      `@${name}`,
    ];
  },

  renderText({ node }) {
    const name = this.options.getPeople().find(p => p.id === node.attrs.userId)?.name
      || node.attrs.label || 'member';
    return `@${name}`;
  },

  addCommands() {
    return {
      insertDocPerson:
        person =>
        ({ commands }) =>
          commands.insertContent([
            { type: this.name, attrs: { userId: person.id, label: person.name } },
            { type: 'text', text: ' ' },
          ]),
    };
  },

  addNodeView() {
    return ({ node }) => {
      let current = node;
      const dom = document.createElement('span');
      dom.className = 'doc-person';

      const render = () => {
        const userId = current.attrs.userId as string | null;
        const match = userId ? this.options.getPeople().find(p => p.id === userId) : undefined;
        const name = match?.name || (current.attrs.label as string) || 'Former member';

        dom.setAttribute('data-user-id', userId || '');
        dom.textContent = `@${name}`;
        dom.title = match ? match.email || name : `${name} is no longer in this workspace`;
        dom.classList.toggle('doc-person-me', !!userId && userId === this.options.getCurrentUserId());
        dom.classList.toggle('doc-person-gone', !match && this.options.getPeople().length > 0);
      };

      render();
      this.storage.renderers.add(render);

      return {
        dom,
        update: updated => {
          if (updated.type.name !== this.name) return false;
          current = updated;
          render();
          return true;
        },
        destroy: () => {
          this.storage.renderers.delete(render);
        },
      };
    };
  },
});
