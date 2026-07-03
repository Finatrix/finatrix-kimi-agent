/**
 * Supabase Storage access for original resume files. Files are immutable:
 * every upload gets a fresh `<user_id>/<uuid>.<ext>` path (never overwritten),
 * and the bucket is private — reads go through short-lived signed URLs.
 */

import { supabase } from '../../lib/supabase';
import { STORAGE_BUCKET } from '../constants';
import { CareersError, mapSupabaseError } from '../utils/errors';

export function buildStoragePath(userId: string, extension: string): string {
  return `${userId}/${crypto.randomUUID()}.${extension}`;
}

export async function uploadResumeFile(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false, // originals are never overwritten
  });
  if (error) {
    if (/bucket.*not found/i.test(error.message)) throw mapSupabaseError(error, 'Upload');
    throw new CareersError('upload', 'Uploading your resume failed. Please try again.');
  }
}

/** Short-lived signed URL for downloading an original file. */
export async function getResumeFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 120, { download: true });
  if (error || !data?.signedUrl) {
    throw new CareersError('storage', 'Could not prepare the download. Please try again.');
  }
  return data.signedUrl;
}

export async function downloadResumeFile(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) {
    throw new CareersError('storage', 'Could not fetch the stored resume file. Please try again.');
  }
  return data;
}

/** Best-effort delete; a failed cleanup never blocks the user action. */
export async function removeResumeFiles(paths: string[]): Promise<void> {
  if (!paths.length) return;
  await supabase.storage.from(STORAGE_BUCKET).remove(paths).then(
    () => undefined,
    () => undefined
  );
}
