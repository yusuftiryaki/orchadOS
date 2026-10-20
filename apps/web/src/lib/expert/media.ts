import type { Client } from "@/lib/supabase/types";

// Signed URLs for the private media bucket (docs/arayuzler.md, "Medya
// depolama"). Rows store 'storage://media/<object name>'.

export const MEDIA_BUCKET = "media";
const PREFIX = `storage://${MEDIA_BUCKET}/`;
export const SIGNED_URL_SECONDS = 60 * 60;

// Object name inside the bucket, or null for files that are not in it
// (e.g. station:// raw files).
export function mediaObjectName(uri: string): string | null {
  return uri.startsWith(PREFIX) && uri.length > PREFIX.length ? uri.slice(PREFIX.length) : null;
}

// One storage call for all files. Missing objects (or ones the user may not
// read) are left out; the UI shows a placeholder for them.
export async function signMedia(supabase: Client, uris: string[]): Promise<Map<string, string>> {
  const names = [...new Set(uris.map(mediaObjectName).filter((n): n is string => n != null))];
  const urls = new Map<string, string>();
  if (names.length === 0) return urls;

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(names, SIGNED_URL_SECONDS);
  if (error) return urls;
  for (const item of data) {
    if (!item.error && item.path && item.signedUrl)
      urls.set(`${PREFIX}${item.path}`, item.signedUrl);
  }
  return urls;
}
