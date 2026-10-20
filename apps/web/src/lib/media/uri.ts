// Media addresses (docs/arayuzler.md, "Medya depolama"). A row's uri is
// storage://<bucket>/<object name>, e.g.
//   storage://media/org/<org_id>/parcel/<parcel_id>/<sha256>
// Other schemes (station://, http) are not served to the browser.

export interface MediaObject {
  bucket: string;
  path: string;
}

const STORAGE_URI = /^storage:\/\/([a-z0-9][a-z0-9_-]*)\/(.+)$/;

// Returns null for anything that is not a well-formed storage:// address.
// Path segments must be non-empty and must not walk out of the bucket.
export function parseMediaUri(uri: string | null | undefined): MediaObject | null {
  if (typeof uri !== "string") return null;
  const match = STORAGE_URI.exec(uri);
  if (!match) return null;
  const [, bucket, path] = match;
  if (/[\\?#\s]/.test(path)) return null;
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  return { bucket, path };
}

export function mediaUri(object: MediaObject): string {
  return `storage://${object.bucket}/${object.path}`;
}

// Object name of a capture or asset file in the media bucket.
export function mediaObjectPath(orgId: string, parcelId: string, contentHash: string): string {
  return `org/${orgId}/parcel/${parcelId}/${contentHash}`;
}
