
import { supabase } from './supabase';

/**
 * Extracts the file path from a Supabase public URL and deletes it from storage.
 * URL Format: .../storage/v1/object/public/bucket-name/folder/file.jpg
 */
export const deleteFileByUrl = async (url: string | undefined | null, bucket: string): Promise<void> => {
  if (!url || !url.includes(`public/${bucket}/`)) return;

  try {
    // Extract the part after "public/bucket-name/"
    const path = url.split(`public/${bucket}/`)[1];
    if (!path) return;

    const { error } = await supabase.storage.from(bucket).remove([path]);
    
    if (error) {
      console.error(`Storage Hygiene Error: Failed to delete ${path} from ${bucket}`, error);
    } else {
      console.debug(`Storage Hygiene Success: Scrubbed ${path} from ${bucket}`);
    }
  } catch (err) {
    console.error('Storage Hygiene Protocol Fault:', err);
  }
};
