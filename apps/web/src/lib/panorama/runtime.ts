import type { Viewer } from "@photo-sphere-viewer/core";

// Browser runtime shared by the panorama viewers (office tool, portal tour):
// one lazy import of Photo Sphere Viewer, image fetches that survive PSV's
// own aborts and feed its cache, and a teardown that frees the WebGL context.
// Nothing here runs on the server or imports three.js eagerly.

type PsvModules = [
  typeof import("@photo-sphere-viewer/core"),
  typeof import("@photo-sphere-viewer/markers-plugin"),
];

let modules: Promise<PsvModules> | null = null;

// The viewer and markers plugin, imported once per page (a failed chunk load
// is retried on the next call).
export function loadPhotoSphere(): Promise<PsvModules> {
  modules ??= Promise.all([
    import("@photo-sphere-viewer/core"),
    import("@photo-sphere-viewer/markers-plugin"),
  ]).catch((error) => {
    modules = null;
    throw error;
  });
  return modules;
}

// A panorama image request that failed (404, refused or expired URL, network).
export class PanoramaLoadError extends Error {
  constructor(
    readonly url: string,
    readonly status: number | null,
  ) {
    super(status ? `panorama image ${status}` : "panorama image unreachable");
    this.name = "PanoramaLoadError";
  }
}

// The cache Photo Sphere Viewer reads before downloading (its `Cache`,
// keyed by the image URL for equirectangular panoramas).
export interface BlobCache {
  get(url: string, key: string): unknown;
  add(url: string, key: string, data: Blob): void;
}

const inflight = new Map<string, Promise<Blob>>();

// Downloads a panorama image into the viewer's cache, so that setPanorama
// only decodes it. Concurrent calls for one URL share the request. Our own
// fetch, not PSV's loader: setPanorama aborts every request of that loader,
// which would also cancel preloads and the next panorama's download.
export function fetchPanorama(
  url: string,
  cache: BlobCache,
  fetcher: typeof fetch = fetch,
): Promise<Blob> {
  const cached = cache.get(url, url);
  if (cached instanceof Blob) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    // Generated stand-ins: nothing to fetch ahead, PSV reads them directly.
    return Promise.resolve(new Blob());
  }
  const request = fetcher(url, { credentials: "same-origin" })
    .catch(() => {
      throw new PanoramaLoadError(url, null);
    })
    .then(async (res) => {
      if (!res.ok) throw new PanoramaLoadError(url, res.status);
      const blob = await res.blob();
      cache.add(url, url, blob);
      return blob;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}

// Warms the cache with images the user is likely to open next. Failures are
// ignored here; the real load reports them.
export function prefetchPanoramas(urls: string[], cache: BlobCache) {
  for (const url of urls) fetchPanorama(url, cache).catch(() => undefined);
}

// PSV reports a load superseded by another setPanorama as an abort.
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /abort|interrupted/i.test(error.message))
  );
}

// WebGL is required by the viewer; without it PSV throws in its constructor.
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

interface ThreeRendererHolder {
  renderer?: { renderer?: { forceContextLoss?: () => void } };
}

// Destroys a viewer and releases its WebGL context at once. three.js
// dispose() keeps the context until garbage collection, and Chromium keeps at
// most 16: walking in and out of the tour would otherwise evict contexts
// ("Too many active WebGL contexts") and leak GPU memory.
export function destroyViewer(viewer: Viewer) {
  const three = (viewer as unknown as ThreeRendererHolder).renderer?.renderer;
  try {
    viewer.destroy();
  } finally {
    try {
      three?.forceContextLoss?.();
    } catch {
      // Already lost.
    }
  }
}

// PSV draws its navbar buttons as divs with a title: give them a button role
// and an accessible name, so screen readers announce them as controls.
export function labelNavbarButtons(container: HTMLElement) {
  for (const button of container.querySelectorAll<HTMLElement>(".psv-button")) {
    button.setAttribute("role", "button");
    const title = button.getAttribute("title");
    if (title) button.setAttribute("aria-label", title);
  }
}
