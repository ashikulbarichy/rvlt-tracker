import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Placeholder, CharacterCount } from '@tiptap/extensions';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code as CodeIcon, Link as LinkIcon,
} from 'lucide-react';

import { lowlight } from './extensions/lowlightConfig';
import { Callout } from './extensions/Callout';
import { SlashCommand } from './extensions/SlashCommand';
import { uploadImage } from '../../lib/uploadImage';

export interface DocHeading {
  id: string;
  level: number;
  text: string;
}

interface DocEditorProps {
  /** Initial HTML. Changing the key remounts; this is not a controlled value. */
  content: string;
  /** Debounced by the caller. Receives both the HTML and its plain-text mirror. */
  onChange: (html: string, text: string) => void;
  editable?: boolean;
  onHeadingsChange?: (headings: DocHeading[]) => void;
  onCharacterCount?: (counts: { words: number; characters: number }) => void;
}

/** Stable slug for a heading, so the TOC can scroll to it. */
export function headingId(text: string, index: number): string {
  const slug = text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `h-${index}-${slug || 'section'}`;
}

function extractHeadings(editor: Editor): DocHeading[] {
  const out: DocHeading[] = [];
  let index = 0;
  editor.state.doc.descendants(node => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      if (text) out.push({ id: headingId(text, index), level: node.attrs.level, text });
      index += 1;
    }
  });
  return out;
}

/**
 * The document editor.
 *
 * Deliberately NOT a modification of `RichTextEditor`: that component disables headings
 * for ticket descriptions, and widening it would change every ticket description in the
 * app. The two share `uploadImage` and nothing else.
 */
export const DocEditor: React.FC<DocEditorProps> = ({
  content,
  onChange,
  editable = true,
  onHeadingsChange,
  onCharacterCount,
}) => {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Replaced by the lowlight version below; leaving both registers the node twice.
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            class: 'text-accent-primary hover:underline cursor-pointer',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        },
      }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'typescript' }),
      Image.configure({
        HTMLAttributes: { class: 'rounded-md max-w-full my-4' },
      }),
      TableKit.configure({
        table: { resizable: true, HTMLAttributes: { class: 'doc-table' } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Callout,
      SlashCommand,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'heading' ? 'Heading' : "Write, or press '/' for blocks…",
      }),
      CharacterCount,
    ],
    content,
    editorProps: {
      attributes: {
        class: 'doc-prose focus:outline-none min-h-[60vh]',
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files || []);
        const image = files.find(f => f.type.startsWith('image/'));
        if (!image) return false;

        event.preventDefault();
        uploadImage(image)
          .then(url => editor?.chain().focus().setImage({ src: url }).run())
          .catch(() => {
            // Surfaced through the editor rather than a console nobody reads.
            editor?.chain().focus().insertContent('<p><em>Image upload failed.</em></p>').run();
          });
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files || []);
        const image = files.find(f => f.type.startsWith('image/'));
        if (!image) return false;

        event.preventDefault();
        uploadImage(image)
          .then(url => editor?.chain().focus().setImage({ src: url }).run())
          .catch(() => undefined);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getText());
      onHeadingsChange?.(extractHeadings(editor));
      onCharacterCount?.({
        words: editor.storage.characterCount.words(),
        characters: editor.storage.characterCount.characters(),
      });
    },
  });

  // Report the initial outline once the document is parsed, not only after an edit.
  useEffect(() => {
    if (!editor) return;
    onHeadingsChange?.(extractHeadings(editor));
    onCharacterCount?.({
      words: editor.storage.characterCount.words(),
      characters: editor.storage.characterCount.characters(),
    });
    // Intentionally keyed on the editor instance alone: re-running on every callback
    // identity change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previous || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <>
      {editable && (
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top' }}
          className="flex items-center gap-0.5 bg-bg-surface-raised border border-border rounded-md shadow-lg p-1"
        >
          {([
            ['bold', Bold, () => editor.chain().focus().toggleBold().run(), 'Bold'],
            ['italic', Italic, () => editor.chain().focus().toggleItalic().run(), 'Italic'],
            ['underline', UnderlineIcon, () => editor.chain().focus().toggleUnderline().run(), 'Underline'],
            ['strike', Strikethrough, () => editor.chain().focus().toggleStrike().run(), 'Strikethrough'],
            ['code', CodeIcon, () => editor.chain().focus().toggleCode().run(), 'Inline code'],
          ] as const).map(([mark, Icon, run, label]) => (
            <button
              key={mark}
              type="button"
              title={label}
              onClick={run}
              className={`p-1.5 rounded transition-colors focus:outline-none ${
                editor.isActive(mark)
                  ? 'bg-bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-bg-surface-hover'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
          <button
            type="button"
            title="Link"
            onClick={setLink}
            className={`p-1.5 rounded transition-colors focus:outline-none ${
              editor.isActive('link')
                ? 'bg-bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:bg-bg-surface-hover'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
          </button>
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />
    </>
  );
};
