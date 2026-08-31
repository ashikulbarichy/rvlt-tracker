import { useCallback } from 'react';
import { uploadImage } from '../lib/uploadImage';

export function useImagePaste(
  text: string,
  setText: (text: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement>
) {
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    let imageFile: File | null = null;
    
    // Check if there is an image in the clipboard
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        imageFile = items[i].getAsFile();
        break;
      }
    }

    if (!imageFile) return;

    // Prevent default paste behavior
    e.preventDefault();

    const textarea = textareaRef.current;
    if (!textarea) return;

    // Get current cursor position
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;

    // Create a temporary placeholder
    const placeholder = `\n![Uploading image...]()\n`;
    
    // Insert placeholder at cursor
    const newText = text.substring(0, startPos) + placeholder + text.substring(endPos);
    setText(newText);
    
    // Update cursor position after the placeholder
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = startPos + placeholder.length;
        textareaRef.current.selectionEnd = startPos + placeholder.length;
      }
    }, 0);

    try {
      // Upload the image
      const imageUrl = await uploadImage(imageFile);
      
      // Replace placeholder with actual markdown image link
      const markdownImage = `\n![image](${imageUrl})\n`;
      // Note: Because we use the captured 'text' from render, if the user typed during upload, 
      // this might overwrite their typing. A true functional state update is better, but since 
      // setText takes a string, we'll do this for now:
      // In a real app we'd prefer passing React.Dispatch<React.SetStateAction<string>> 
      // but since we only have `(text: string) => void`, we replace on the current `newText` we just computed.
      // Actually we must rely on the latest textarea value if possible.
      if (textareaRef.current) {
         const latestText = textareaRef.current.value;
         setText(latestText.replace(placeholder, markdownImage));
      } else {
         setText(text.replace(placeholder, markdownImage));
      }
    } catch (error) {
      console.error('Failed to upload pasted image:', error);
      // Remove placeholder on failure
      if (textareaRef.current) {
         const latestText = textareaRef.current.value;
         setText(latestText.replace(placeholder, ''));
      } else {
         setText(text.replace(placeholder, ''));
      }
      alert('Failed to upload image. Please try again.');
    }
  }, [text, setText, textareaRef]);

  return handlePaste;
}
