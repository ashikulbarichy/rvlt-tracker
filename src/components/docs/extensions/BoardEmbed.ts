import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeViewRegistry } from './DocPerson';
import type { LinkableDoc } from './DocLink';
import { boardThumbnailUrl } from '../board/boardFiles';

export interface BoardEmbedOptions {
  /** Documents the CURRENT VIEWER can read; boards among them can be embedded or shown. */
  getDocs: () => LinkableDoc[];
  onOpen: (docId: string) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    boardEmbed: {
      insertBoardEmbed: (boardId?: string | null) => ReturnType;
    };
  }
  interface Storage {
    boardEmbed: NodeViewRegistry;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A whiteboard shown inside a page: its thumbnail, title and an "Open" button.
 *
 * Access follows the board, exactly as DocLink does. The stored HTML holds only the
 * board's id; title and thumbnail are resolved at view time from what the reader can
 * see, and a reader without access to the board gets a "No access" card. The thumbnail
 * is fetched through a signed URL, which the storage policy only issues to people who
 * can see the board.
 */
export const BoardEmbed = Node.create<BoardEmbedOptions>({
  name: 'boardEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      getDocs: () => [],
      onOpen: () => undefined,
    };
  },

  addStorage() {
    return { renderers: new Set<() => void>() };
  },

  addAttributes() {
    return {
      boardId: {
        default: null,
        parseHTML: element => element.getAttribute('data-board-id'),
        renderHTML: attributes => (attributes.boardId ? { 'data-board-id': attributes.boardId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-board-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-board-embed': '', class: 'board-embed' })];
  },

  // Contributes nothing to the page's text: the board's title stays out of this page's
  // search index, for the same reason DocLink keeps link titles out.
  renderText() {
    return '';
  },

  addCommands() {
    return {
      insertBoardEmbed:
        (boardId = null) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { boardId } }),
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      let thumbToken = 0;
      const dom = el('div', 'board-embed');
      dom.contentEditable = 'false';

      const boards = () => this.options.getDocs().filter(d => d.kind === 'whiteboard');

      const setBoard = (boardId: string) => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (typeof pos !== 'number') return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { boardId }));
      };

      const renderPicker = () => {
        const wrap = el('div', 'board-embed-picker');
        const available = boards();
        if (!editor.isEditable) {
          wrap.appendChild(el('span', 'board-embed-muted', 'No whiteboard chosen.'));
          return wrap;
        }
        if (available.length === 0) {
          wrap.appendChild(el('span', 'board-embed-muted', 'No whiteboards yet. Create one under Whiteboards in the sidebar.'));
          return wrap;
        }
        wrap.appendChild(el('span', 'board-embed-label', 'Embed a whiteboard'));
        const select = el('select', 'board-embed-select');
        select.appendChild(new Option('Choose…', ''));
        for (const b of available) select.appendChild(new Option(`${b.icon ? `${b.icon} ` : ''}${b.title || 'Untitled'}`, b.id));
        select.addEventListener('change', () => {
          if (select.value) setBoard(select.value);
        });
        wrap.appendChild(select);
        return wrap;
      };

      const render = () => {
        const boardId = current.attrs.boardId as string | null;
        dom.replaceChildren();
        dom.setAttribute('data-board-id', boardId || '');

        if (!boardId) {
          dom.appendChild(renderPicker());
          return;
        }

        const board = boards().find(b => b.id === boardId);
        if (!board) {
          // Unresolvable means the reader cannot see it. Say nothing more than that.
          dom.classList.add('board-embed-locked');
          dom.appendChild(el('div', 'board-embed-thumb board-embed-thumb-empty', '🔒'));
          const body = el('div', 'board-embed-body');
          body.appendChild(el('span', 'board-embed-title', 'No access'));
          body.appendChild(el('span', 'board-embed-muted', 'You do not have access to this whiteboard.'));
          dom.appendChild(body);
          return;
        }

        dom.classList.remove('board-embed-locked');
        const thumb = el('div', 'board-embed-thumb board-embed-thumb-empty', board.icon || '🧩');
        dom.appendChild(thumb);

        const body = el('div', 'board-embed-body');
        body.appendChild(el('span', 'board-embed-title', board.title || 'Untitled whiteboard'));
        body.appendChild(el('span', 'board-embed-muted', 'Whiteboard'));
        const open = el('button', 'board-embed-open', 'Open whiteboard →');
        open.type = 'button';
        open.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          this.options.onOpen(boardId);
        });
        body.appendChild(open);
        dom.appendChild(body);

        const token = ++thumbToken;
        void boardThumbnailUrl(boardId).then(url => {
          if (!url || token !== thumbToken) return;
          const img = document.createElement('img');
          img.alt = '';
          img.src = url;
          img.addEventListener('load', () => {
            if (token !== thumbToken) return;
            thumb.classList.remove('board-embed-thumb-empty');
            thumb.replaceChildren(img);
          });
        });
      };

      render();
      this.storage.renderers.add(render);

      return {
        dom,
        // The picker's <select> must keep its own events.
        stopEvent: event => (event.target as HTMLElement | null)?.tagName === 'SELECT',
        ignoreMutation: () => true,
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
