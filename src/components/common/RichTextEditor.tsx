import React, { useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Bold, Italic, List, Image as ImageIcon, Loader2, Link as LinkIcon } from 'lucide-react';
import { uploadImage } from '../../lib/uploadImage';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
  content, 
  onChange, 
  placeholder = 'Add description...', 
  minHeight = '150px' 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadSingleFile = async (file: File) => {
    if (!editor) return;
    try {
      setIsUploading(true);
      const url = await uploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error('Image upload failed', err);
      alert('Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // We can disable headings if we want a simpler editor
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-md max-w-full max-h-[400px] object-contain my-4',
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-accent-primary hover:underline cursor-pointer',
          target: '_blank',
          rel: 'noopener noreferrer'
        },
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none w-full px-3 py-2 text-text-primary placeholder-text-text-tertiary bg-transparent`,
        style: `min-height: ${minHeight};`,
      },
      handlePaste: (view, event, slice) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        
        let imageFile: File | null = null;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            imageFile = items[i].getAsFile();
            break;
          }
        }
        
        if (imageFile) {
          event.preventDefault();
          // Reuse the handleImageUpload logic but we don't have an event.target.files
          // Let's create a helper to upload a single file directly
          uploadSingleFile(imageFile);
          return true;
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;

    await uploadSingleFile(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!editor) {
    return null;
  }

  const handleLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    // cancelled
    if (url === null) {
      return;
    }

    // empty
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    // update link
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="w-full flex flex-col border border-transparent rounded-sm bg-transparent overflow-hidden focus-within:border-text-secondary focus-within:ring-1 focus-within:ring-text-secondary transition-colors">
      <div className="flex items-center space-x-1 p-1 border-b border-border bg-bg-surface flex-wrap gap-y-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded-full transition-colors ${editor.isActive('bold') ? 'bg-border text-text-primary' : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'}`}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded-full transition-colors ${editor.isActive('italic') ? 'bg-border text-text-primary' : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'}`}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </button>
        
        <div className="w-px h-4 bg-border mx-1" />
        
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded-full transition-colors ${editor.isActive('bulletList') ? 'bg-border text-text-primary' : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'}`}
          title="Bullet List (Ctrl+Shift+8)"
        >
          <List className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleLink}
          className={`p-1.5 rounded-full transition-colors ${editor.isActive('link') ? 'bg-border text-text-primary' : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'}`}
          title="Add Link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/png, image/jpeg, image/gif, image/webp"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-1.5 rounded-full text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50"
          title="Insert Image"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 cursor-text bg-transparent text-sm">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
