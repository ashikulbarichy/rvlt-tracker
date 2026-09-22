import { Node, mergeAttributes } from '@tiptap/core';

export interface LinkableDoc {
  id: string;
  title: string;
  icon: string | null;
}

export interface DocLinkOptions {
  /**
   * The documents the CURRENT VIEWER can read, read fresh on every render rather than
   * captured once — the editor is created on mount and the list arrives from a query.
   */
  getDocs: () => LinkableDoc[];
  onOpen: (docId: string) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docLink: {
      insertDocLink: (docId: string) => ReturnType;
    };
  }
}

/**
 * An inline link to another document.
 *
 * The stored HTML carries ONLY the target's id — never its title. Titles are resolved
 * at view time from the documents the reader can actually see, which matters because a
 * link does not, and must not, extend access:
 *
 *   * a reader with access sees the live title, so renaming a document updates every
 *     link to it;
 *   * a reader without access sees "No access" and learns nothing about what is behind
 *     it, not even its name.
 *
 * Denormalising the title into the link text would have been simpler and is what most
 * editors do, but it would write the target's title into the linking document's content
 * — and therefore into its search vector — where anyone who can read the parent could
 * see it. The whole point here is that access follows the target, not the link.
 *
 * A plain DOM node view rather than a React one, deliberately: the label depends on
 * query data, and a DOM node view re-renders on demand without assuming anything about
 * how TipTap's React renderer propagates context into portals.
 */
export const DocLink = Node.create<DocLinkOptions>({
  name: 'docLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      getDocs: () => [],
      onOpen: () => undefined,
    };
  },

  addAttributes() {
    return {
      docId: {
        default: null,
        parseHTML: element => element.getAttribute('data-doc-id'),
        renderHTML: attributes =>
          attributes.docId ? { 'data-doc-id': attributes.docId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-doc-id]' }, { tag: 'span[data-doc-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { class: 'doc-link' })];
  },

  // No renderText override: the node contributes nothing to editor.getText(), so the
  // target's title stays out of content_text and out of this document's search vector.

  addCommands() {
    return {
      insertDocLink:
        (docId: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { docId } }),
    };
  },

  addNodeView() {
    return ({ node }) => {
      let current = node;

      const dom = document.createElement('a');
      dom.className = 'doc-link';

      const render = () => {
        const docId = current.attrs.docId as string | null;
        const match = docId ? this.options.getDocs().find(d => d.id === docId) : undefined;

        dom.setAttribute('data-doc-id', docId || '');

        if (match) {
          dom.textContent = `${match.icon ? `${match.icon} ` : ''}${match.title || 'Untitled'}`;
          dom.title = 'Open document';
          dom.classList.remove('doc-link-locked');
        } else {
          // Unresolvable means the reader cannot see it — no access, or it is in the
          // trash. The destination page says which; saying more here would leak it.
          dom.textContent = 'No access';
          dom.title = 'You do not have access to this document';
          dom.classList.add('doc-link-locked');
        }
      };

      render();

      dom.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const docId = current.attrs.docId as string | null;
        // Locked links navigate too: the document page states plainly why it is not
        // available, which beats a link that silently does nothing.
        if (docId) this.options.onOpen(docId);
      });

      return {
        dom,
        update: updated => {
          if (updated.type.name !== this.name) return false;
          current = updated;
          render();
          return true;
        },
      };
    };
  },
});
