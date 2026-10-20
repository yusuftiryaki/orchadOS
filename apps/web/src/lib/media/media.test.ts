import { describe, expect, it, vi } from "vitest";
import { createMediaSigner, SignedUrlCache } from "./signer";
import { mediaObjectPath, mediaUri, parseMediaUri } from "./uri";

const ORG = "b0000000-0000-4000-8000-000000000001";
const PARCEL = "c0000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);
const PATH = `org/${ORG}/parcel/${PARCEL}/${HASH}`;

describe("parseMediaUri", () => {
  it("splits bucket and object name", () => {
    expect(parseMediaUri(`storage://media/${PATH}`)).toEqual({ bucket: "media", path: PATH });
    expect(mediaUri({ bucket: "media", path: PATH })).toBe(`storage://media/${PATH}`);
    expect(mediaObjectPath(ORG, PARCEL, HASH)).toBe(PATH);
  });

  it.each([
    null,
    undefined,
    "",
    "station://kit-1/videos/a.mp4",
    "https://example.com/a.jpg",
    "storage://media",
    "storage://media/",
    "storage://Media/a",
    "storage://media//a",
    "storage://media/a/../b",
    "storage://media/./a",
    "storage://media/a/",
    "storage://media/a?b=1",
    "storage://media/a#x",
    "storage://media/a b",
    "storage://media/a\\b",
  ])("rejects %j", (uri) => {
    expect(parseMediaUri(uri)).toBeNull();
  });
});

function fakeStorage(existing: Set<string>) {
  const createSignedUrls = vi.fn(async (paths: string[], expiresIn: number) => ({
    data: paths.map((path) =>
      existing.has(path)
        ? { path, error: null, signedUrl: `https://signed/${path}?e=${expiresIn}` }
        : { path, error: "Either the object does not exist", signedUrl: "" },
    ),
    error: null,
  }));
  const from = vi.fn(() => ({ createSignedUrls }));
  return { client: { storage: { from } } as never, from, createSignedUrls };
}

describe("createMediaSigner", () => {
  const present = `storage://media/${PATH}`;
  const missingPath = `org/${ORG}/parcel/${PARCEL}/${"b".repeat(64)}`;
  const missing = `storage://media/${missingPath}`;

  it("signs in one batch and leaves missing or malformed files as null", async () => {
    const storage = fakeStorage(new Set([PATH]));
    const signer = createMediaSigner(storage.client, { scope: "u1", cache: null });
    const urls = await signer.signUrls([present, missing, "station://x/y", present, null]);
    expect(urls.get(present)).toBe(`https://signed/${PATH}?e=900`);
    expect(urls.get(missing)).toBeNull();
    expect(urls.get("station://x/y")).toBeNull();
    expect(urls.size).toBe(3);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrls.mock.calls[0][0]).toEqual([PATH, missingPath]);
    expect(storage.from).toHaveBeenCalledWith("media");
  });

  it("treats a failed request as placeholders", async () => {
    const createSignedUrls = vi.fn(async () => ({ data: null, error: new Error("boom") }));
    const client = { storage: { from: () => ({ createSignedUrls }) } } as never;
    const signer = createMediaSigner(client, { scope: "u1", cache: null });
    expect(await signer.signUrl(present)).toBeNull();
  });

  it("caches per scope and expires entries", async () => {
    const storage = fakeStorage(new Set([PATH]));
    const cache = new SignedUrlCache(1000);
    let now = 0;
    const a = createMediaSigner(storage.client, { scope: "u1", cache, now: () => now });
    const b = createMediaSigner(storage.client, { scope: "u2", cache, now: () => now });

    await a.signUrl(present);
    await a.signUrl(present);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);

    // Another user never gets the first user's URL from the cache.
    await b.signUrl(present);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(2);

    now = 1001;
    await a.signUrl(present);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(3);
  });

  it("does not cache refusals", async () => {
    const storage = fakeStorage(new Set());
    const signer = createMediaSigner(storage.client, { scope: "u1", cache: new SignedUrlCache() });
    expect(await signer.signUrl(present)).toBeNull();
    expect(await signer.signUrl(present)).toBeNull();
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("splits large requests into batches", async () => {
    const paths = Array.from({ length: 450 }, (_, i) => `org/${ORG}/parcel/${PARCEL}/${i}`);
    const storage = fakeStorage(new Set(paths));
    const signer = createMediaSigner(storage.client, { scope: "u1", cache: null });
    const urls = await signer.signUrls(paths.map((p) => `storage://media/${p}`));
    expect([...urls.values()].every(Boolean)).toBe(true);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(3);
  });
});

describe("SignedUrlCache", () => {
  it("drops the oldest entry when full", () => {
    const cache = new SignedUrlCache(1000, 2);
    cache.set("a", "1", 0);
    cache.set("b", "2", 0);
    cache.set("c", "3", 0);
    expect(cache.size).toBe(2);
    expect(cache.get("a", 0)).toBeUndefined();
    expect(cache.get("c", 0)).toBe("3");
  });
});
