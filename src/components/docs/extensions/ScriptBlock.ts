import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    scriptBlock: {
      setScriptBlock: () => ReturnType;
      toggleScriptBlock: () => ReturnType;
      unsetScriptBlock: () => ReturnType;
    };
  }
}

/**
 * A block of spoken words, set in a typewriter face.
 *
 * Scripts are written in Courier by convention — it is monospaced, so a page of it maps
 * predictably onto reading time, which is the whole reason the convention exists. This
 * marks the parts that get *said* so they read differently from the brief around them.
 *
 * Built like `Callout`: a plain block container holding normal block content, so lists
 * and tables keep working inside it. The marker is a `data-type` attribute, so the
 * stored HTML round-trips through dompurify and renders the same outside the editor.
 */
export const ScriptBlock = Node.create({
  name: 'scriptBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="script"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'script', class: 'doc-script' }),
      0,
    ];
  },

  addCommands() {
    return {
      setScriptBlock:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
      toggleScriptBlock:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      unsetScriptBlock:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at the start of an empty script block lifts out of it, rather than
      // leaving the caret trapped. Same escape hatch as Callout.
      Backspace: ({ editor }) => {
        const { empty, $anchor } = editor.state.selection;
        if (!empty || $anchor.parent.type.name !== 'paragraph') return false;
        if ($anchor.parentOffset !== 0) return false;

        const grandparent = $anchor.node(-1);
        if (grandparent?.type.name !== this.name) return false;
        if (grandparent.childCount > 1) return false;

        return editor.commands.lift(this.name);
      },
    };
  },
});
