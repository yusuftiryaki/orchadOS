import type { Page } from "@playwright/test";

// Shared by the panorama viewer tests (demo-tour.spec.ts, office-tool.spec.ts).

// Counts WebGL contexts (created, and still alive) before any page script.
export const COUNT_GL = () => {
  const contexts: WebGLRenderingContext[] = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    ...rest: unknown[]
  ) {
    const ctx = (getContext as (...a: unknown[]) => unknown).call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !contexts.includes(ctx as WebGLRenderingContext)) {
      contexts.push(ctx as WebGLRenderingContext);
    }
    return ctx;
  } as typeof getContext;
  (window as unknown as { __gl: () => { created: number; live: number } }).__gl = () => ({
    created: contexts.length,
    live: contexts.filter((c) => !c.isContextLost()).length,
  });
};

// Basemap tiles come through the app's tile proxy (/harita/karo/…), which
// cannot reach the tile servers in an offline test run; those errors belong
// to the map, not to the panorama viewers.
const BASEMAP = "/harita/karo/";

// Console errors, evicted WebGL contexts and uncaught page errors.
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.location().url.includes(BASEMAP) || m.text().includes(BASEMAP)) return;
    if (m.type() === "error" || /Too many active WebGL contexts/.test(m.text())) {
      errors.push(m.text());
    }
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export function glContexts(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __gl: () => { created: number; live: number } }).__gl(),
  );
}

// The panorama's three.js texture count (the viewer's test hook).
export function viewerTextures(viewer: ReturnType<Page["getByTestId"]>) {
  return viewer.evaluate(
    (el) =>
      (
        el as unknown as {
          __viewer: { renderer: { renderer: { info: { memory: { textures: number } } } } };
        }
      ).__viewer.renderer.renderer.info.memory.textures,
  );
}
