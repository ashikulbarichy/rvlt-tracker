import { supabase } from '../../../lib/supabase';

/**
 * Images on a whiteboard live in the private `board-files` bucket at
 * "<doc id>/<file id>", never inline in the shape rows. Storage policies check the
 * first path segment against the board's own access, so a restricted moodboard's images
 * are as restricted as the board.
 */
export const BOARD_BUCKET = 'board-files';
const THUMBNAIL = 'thumbnail.png';

// Excalidraw file ids are hashes or nanoids. Anything else is refused rather than used
// to build a storage path.
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function filePath(docId: string, fileId: string): string {
  if (!SAFE_ID.test(fileId)) throw new Error('Invalid image id.');
  return `${docId}/${fileId}`;
}

export async function uploadBoardFile(
  docId: string,
  fileId: string,
  dataURL: string,
  mimeType: string
): Promise<void> {
  const blob = await (await fetch(dataURL)).blob();
  const { error } = await supabase.storage
    .from(BOARD_BUCKET)
    .upload(filePath(docId, fileId), blob, { contentType: mimeType, upsert: false });
  // File ids are content hashes: "already exists" means the same image is already there.
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

/** Authenticated download, so the storage SELECT policy is what decides. */
export async function downloadBoardFile(
  docId: string,
  fileId: string
): Promise<{ dataURL: string; mimeType: string }> {
  const { data, error } = await supabase.storage.from(BOARD_BUCKET).download(filePath(docId, fileId));
  if (error) throw error;
  return { dataURL: await blobToDataURL(data), mimeType: data.type || 'image/png' };
}

export async function uploadBoardThumbnail(docId: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from(BOARD_BUCKET)
    .upload(`${docId}/${THUMBNAIL}`, blob, { contentType: 'image/png', upsert: true });
  if (error) throw error;
  thumbnailCache.delete(docId);
}

// Signed URLs last an hour; reuse one for most of that rather than asking per render.
const thumbnailCache = new Map<string, { url: string | null; expires: number }>();
const SIGNED_FOR_S = 3600;

/**
 * A signed URL for a board's thumbnail, or null if it has none yet or the reader cannot
 * see the board -- the two are deliberately indistinguishable here.
 */
export async function boardThumbnailUrl(docId: string): Promise<string | null> {
  const cached = thumbnailCache.get(docId);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(BOARD_BUCKET)
    .createSignedUrl(`${docId}/${THUMBNAIL}`, SIGNED_FOR_S);
  const url = error ? null : data?.signedUrl ?? null;
  // A missing thumbnail is re-checked sooner: the board may be saved any minute.
  thumbnailCache.set(docId, {
    url,
    expires: Date.now() + (url ? (SIGNED_FOR_S - 300) * 1000 : 60 * 1000),
  });
  return url;
}
