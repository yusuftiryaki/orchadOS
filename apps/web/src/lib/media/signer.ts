import type { Client } from "@/lib/supabase/types";
import { parseMediaUri } from "./uri";

// Turns storage:// addresses into short-lived signed URLs, as the signed-in
// user: storage row level security decides which files may be signed, so a
// file of an unpublished session (or a missing file) comes back as null and
// the UI shows a placeholder.
//
// Signed URLs are kept in a small in-memory cache. The cache key includes the
// caller's scope (user id): a URL signed for one user is never handed to another.

export const SIGNED_URL_TTL_S = 15 * 60;
// Cached URLs are reused only while they have at least this long left.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;
// Paths per createSignedUrls request.
const BATCH_SIZE = 200;

export class SignedUrlCache {
  private entries = new Map<string, { url: string; expiresAt: number }>();

  constructor(
    private readonly ttlMs = CACHE_TTL_MS,
    private readonly maxEntries = CACHE_MAX_ENTRIES,
  ) {}

  get(key: string, now: number): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.url;
  }

  set(key: string, url: string, now: number) {
    // Oldest first: Map keeps insertion order.
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.delete(key);
    this.entries.set(key, { url, expiresAt: now + this.ttlMs });
  }

  get size() {
    return this.entries.size;
  }
}

const sharedCache = new SignedUrlCache();

export interface MediaSigner {
  // uri -> signed URL, or null when the uri is malformed, the file is missing
  // or signing was refused. Every distinct non-empty input uri is a key.
  signUrls(uris: Iterable<string | null | undefined>): Promise<Map<string, string | null>>;
  signUrl(uri: string | null | undefined): Promise<string | null>;
}

export function createMediaSigner(
  client: Pick<Client, "storage">,
  options: {
    // Whose permissions the URLs carry; part of the cache key.
    scope: string;
    expiresInS?: number;
    cache?: SignedUrlCache | null;
    now?: () => number;
  },
): MediaSigner {
  const expiresIn = options.expiresInS ?? SIGNED_URL_TTL_S;
  const cache = options.cache === undefined ? sharedCache : options.cache;
  const now = options.now ?? Date.now;

  async function signUrls(uris: Iterable<string | null | undefined>) {
    const result = new Map<string, string | null>();
    const pending = new Map<string, Map<string, string[]>>(); // bucket -> path -> uris
    const at = now();

    for (const uri of uris) {
      if (!uri || result.has(uri)) continue;
      const object = parseMediaUri(uri);
      if (!object) {
        result.set(uri, null);
        continue;
      }
      const cached = cache?.get(cacheKey(options.scope, uri), at);
      if (cached) {
        result.set(uri, cached);
        continue;
      }
      result.set(uri, null);
      const paths = pending.get(object.bucket) ?? new Map<string, string[]>();
      pending.set(object.bucket, paths);
      paths.set(object.path, [...(paths.get(object.path) ?? []), uri]);
    }

    for (const [bucket, paths] of pending) {
      const all = [...paths.keys()];
      for (let i = 0; i < all.length; i += BATCH_SIZE) {
        const batch = all.slice(i, i + BATCH_SIZE);
        const { data, error } = await client.storage
          .from(bucket)
          .createSignedUrls(batch, expiresIn);
        // A failed request leaves the whole batch as placeholders.
        if (error || !data) continue;
        for (const item of data) {
          if (item.error || !item.signedUrl || !item.path) continue;
          for (const uri of paths.get(item.path) ?? []) {
            result.set(uri, item.signedUrl);
            cache?.set(cacheKey(options.scope, uri), item.signedUrl, at);
          }
        }
      }
    }
    return result;
  }

  return {
    signUrls,
    async signUrl(uri) {
      if (!uri) return null;
      return (await signUrls([uri])).get(uri) ?? null;
    },
  };
}

function cacheKey(scope: string, uri: string) {
  return `${scope}\n${uri}`;
}
