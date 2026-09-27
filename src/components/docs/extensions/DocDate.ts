import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeViewRegistry } from './DocPerson';
import { formatDocDate, formatDocDateLong, parseIsoDate, toIsoDate } from './mentionItems';

interface DocDateStorage extends NodeViewRegistry {
  /** Set by "Pick a date…": the next date chip created opens its picker straight away. */
  openPickerOnNextMount: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docDate: {
      insertDocDate: (date: string, options?: { openPicker?: boolean }) => ReturnType;
    };
  }
  interface Storage {
    docDate: DocDateStorage;
  }
}

/**
 * Open the browser's native date picker anchored on `anchor`, and report the choice.
 *
 * A native input rather than a calendar component: it is accessible, localised and
 * already on every platform this app runs on, including the phone PWA, and adding a
 * date-picker dependency for one chip is not worth it. The input lives on <body>, not in
 * the chip, so ProseMirror never sees a DOM mutation inside its document.
 */
function openDatePicker(anchor: HTMLElement, value: string, onPick: (iso: string) => void) {
  const rect = anchor.getBoundingClientRect();
  const input = document.createElement('input');
  input.type = 'date';
  input.value = value;
  input.tabIndex = -1;
  Object.assign(input.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.bottom}px`,
    width: '1px',
    height: '1px',
    opacity: '0',
    border: '0',
    padding: '0',
    pointerEvents: 'none',
  });

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    input.remove();
  };

  input.addEventListener('change', () => {
    if (parseIsoDate(input.value)) onPick(input.value);
    cleanup();
  });
  input.addEventListener('blur', () => setTimeout(cleanup, 0));
  input.addEventListener('cancel', cleanup);

  document.body.appendChild(input);
  try {
    input.showPicker();
  } catch {
    // No showPicker, or no user activation to spend: focusing still lets the keyboard
    // and most mobile browsers open it.
    input.focus();
    input.click();
  }
}

/**
 * An inline date: stored as a plain calendar date (YYYY-MM-DD), shown as "Oct 5".
 *
 * The attribute is the truth; the text inside the stored HTML is only a readable
 * fallback. Storing a calendar date rather than a timestamp means the chip shows the
 * same day to everyone regardless of their time zone, which is what a date in a
 * sentence means. In an editable document, clicking the chip changes the date.
 */
export const DocDate = Node.create({
  name: 'docDate',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return { renderers: new Set<() => void>(), openPickerOnNextMount: false };
  },

  addAttributes() {
    return {
      date: {
        default: null,
        parseHTML: element => element.getAttribute('data-date'),
        renderHTML: attributes => (attributes.date ? { 'data-date': attributes.date } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'time[data-date]' }, { tag: 'span[data-date]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const date = node.attrs.date as string | null;
    return [
      'time',
      mergeAttributes(HTMLAttributes, { class: 'doc-date', datetime: date || undefined }),
      date ? formatDocDateLong(date) : 'No date',
    ];
  },

  renderText({ node }) {
    const date = node.attrs.date as string | null;
    return date ? formatDocDateLong(date) : '';
  },

  addCommands() {
    return {
      insertDocDate:
        (date, options) =>
        ({ commands }) => {
          this.storage.openPickerOnNextMount = !!options?.openPicker;
          return commands.insertContent([
            { type: this.name, attrs: { date } },
            { type: 'text', text: ' ' },
          ]);
        },
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      const dom = document.createElement('time');
      dom.className = 'doc-date';

      const render = () => {
        const date = current.attrs.date as string | null;
        const valid = !!parseIsoDate(date);
        dom.setAttribute('data-date', date || '');
        if (date) dom.setAttribute('datetime', date);
        dom.textContent = valid ? formatDocDate(date!) : 'Invalid date';
        dom.title = valid
          ? `${formatDocDateLong(date!)}${editor.isEditable ? ' · click to change' : ''}`
          : '';
        dom.classList.toggle('doc-date-today', valid && date === toIsoDate(new Date()));
        dom.classList.toggle('doc-date-editable', editor.isEditable);
      };

      const pick = () => {
        if (!editor.isEditable) return;
        const date = (current.attrs.date as string | null) || toIsoDate(new Date());
        openDatePicker(dom, date, iso => {
          const pos = typeof getPos === 'function' ? getPos() : undefined;
          if (typeof pos !== 'number') return;
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { date: iso }));
        });
      };

      render();
      this.storage.renderers.add(render);

      dom.addEventListener('mousedown', event => {
        // Keep ProseMirror from turning the click into a node selection first; the
        // picker is the whole interaction.
        if (editor.isEditable) event.preventDefault();
      });
      dom.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        pick();
      });

      if (this.storage.openPickerOnNextMount) {
        this.storage.openPickerOnNextMount = false;
        // The chip is not in the document yet while its view is being built. A microtask
        // runs once the insert has been drawn but still inside the click or keypress
        // that chose "Pick a date…" -- showPicker() refuses to open outside a user
        // gesture, and a timer or animation frame can land after the gesture expires.
        queueMicrotask(pick);
      }

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
