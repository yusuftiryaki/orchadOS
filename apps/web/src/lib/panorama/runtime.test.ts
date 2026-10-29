import { describe, expect, it, vi } from "vitest";
import {
  destroyViewer,
  fetchPanorama,
  isAbortError,
  PanoramaLoadError,
  prefetchPanoramas,
  type BlobCache,
} from "./runtime";

function memoryCache(): BlobCache & { items: Map<string, Blob> } {
  const items = new Map<string, Blob>();
  return {
    items,
    get: (url) => items.get(url),
    add: (url, _key, blob) => items.set(url, blob),
  };
}

const ok = (body = "img") =>
  ({ ok: true, status: 200, blob: async () => new Blob([body]) }) as unknown as Response;

describe("fetchPanorama", () => {
  it("downloads into the cache and serves later calls from it", async () => {
    const cache = memoryCache();
    const fetcher = vi.fn(async () => ok());
    const blob = await fetchPanorama("https://x/a.webp", cache, fetcher);
    expect(await blob.text()).toBe("img");
    expect(cache.items.get("https://x/a.webp")).toBe(blob);
    await fetchPanorama("https://x/a.webp", cache, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("shares one request between concurrent calls (preload and open)", async () => {
    const cache = memoryCache();
    let release!: () => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(ok());
        }),
    );
    const a = fetchPanorama("https://x/b.webp", cache, fetcher);
    const b = fetchPanorama("https://x/b.webp", cache, fetcher);
    release();
    expect(await a).toBe(await b);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports HTTP and network failures, and tries again next time", async () => {
    const cache = memoryCache();
    const notFound = vi.fn(async () => ({ ok: false, status: 404 }) as Response);
    await expect(fetchPanorama("https://x/c.webp", cache, notFound)).rejects.toMatchObject({
      name: "PanoramaLoadError",
      status: 404,
    });
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = await fetchPanorama("https://x/c.webp", cache, offline).catch((e) => e);
    expect(error).toBeInstanceOf(PanoramaLoadError);
    expect(error.status).toBeNull();
    expect(cache.items.size).toBe(0);
    await fetchPanorama(
      "https://x/c.webp",
      cache,
      vi.fn(async () => ok()),
    );
    expect(cache.items.size).toBe(1);
  });

  it("does not fetch generated stand-ins", async () => {
    const fetcher = vi.fn(async () => ok());
    await fetchPanorama("data:image/jpeg;base64,AAAA", memoryCache(), fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("swallows preload failures", async () => {
    const cache = memoryCache();
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
    try {
      expect(() => prefetchPanoramas(["https://x/d.webp"], cache)).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("viewer teardown", () => {
  it("destroys the viewer and releases its WebGL context", () => {
    const calls: string[] = [];
    const viewer = {
      destroy: () => calls.push("destroy"),
      renderer: { renderer: { forceContextLoss: () => calls.push("lose") } },
    };
    destroyViewer(viewer as never);
    expect(calls).toEqual(["destroy", "lose"]);
  });

  it("releases the context even when destroy throws", () => {
    const calls: string[] = [];
    const viewer = {
      destroy: () => {
        throw new Error("boom");
      },
      renderer: { renderer: { forceContextLoss: () => calls.push("lose") } },
    };
    expect(() => destroyViewer(viewer as never)).toThrow("boom");
    expect(calls).toEqual(["lose"]);
  });

  it("recognises PSV's aborted loads", () => {
    expect(isAbortError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(isAbortError(new Error("Loading was interrupted"))).toBe(true);
    expect(isAbortError(new PanoramaLoadError("u", 404))).toBe(false);
    expect(isAbortError("abort")).toBe(false);
  });
});
