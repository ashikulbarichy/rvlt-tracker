import { Node, mergeAttributes } from '@tiptap/core';

export type CalloutVariant = 'info' | 'warning' | 'success';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant?: CalloutVariant) => ReturnType;
      toggleCallout: (variant?: CalloutVariant) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

/**
 * A boxed aside — info, warning or success.
 *
 * The one block a wiki genuinely needs that TipTap does not ship for free (its Details
 * and Drag Handle extensions are Pro-licensed). Implemented as a plain block container
 * holding normal block content, so everything inside it — lists, code, tables — keeps
 * working without special handling.
 *
 * The variant lives in a `data-variant` attribute so the stored HTML round-trips through
 * dompurify and renders identically outside the editor.
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info' as CalloutVariant,
        parseHTML: element => element.getAttribute('data-variant') || 'info',
        renderHTML: attributes => ({ 'data-variant': attributes.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'doc-callout' }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (variant = 'info') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { variant }),
      toggleCallout:
        (variant = 'info') =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { variant }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at the very start of an empty callout lifts out of it rather than
      // leaving the cursor trapped in an empty box.
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
