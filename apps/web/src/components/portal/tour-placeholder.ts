import { t } from "@/lib/i18n";
import { normalize180 } from "@/lib/portal/tour";

// Equirectangular stand-in when a panorama's image is missing: sky, ground,
// horizon and compass letters at their true directions, so arrows and tree
// markers still make sense. Drawn in the browser, a few per heading kept.

const CACHE_SIZE = 8;
const cache = new Map<number, string>();

export function placeholderPanorama(headingDeg: number): string {
  const key = Math.round(headingDeg);
  const cached = cache.get(key);
  if (cached) {
    // Most recently used last.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const sky = ctx.createLinearGradient(0, 0, 0, height / 2);
  sky.addColorStop(0, "#74c0fc");
  sky.addColorStop(1, "#e7f5ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height / 2);
  const ground = ctx.createLinearGradient(0, height / 2, 0, height);
  ground.addColorStop(0, "#d8c8a8");
  ground.addColorStop(1, "#8c7a55");
  ctx.fillStyle = ground;
  ctx.fillRect(0, height / 2, width, height / 2);
  ctx.fillStyle = "#495057";
  ctx.fillRect(0, height / 2 - 1, width, 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const column = (azimuth: number) => (0.5 + normalize180(azimuth - headingDeg) / 360) * width;
  ctx.font = "bold 56px system-ui, sans-serif";
  for (const [label, azimuth] of [
    ["K", 0],
    ["D", 90],
    ["G", 180],
    ["B", 270],
  ] as const) {
    ctx.fillStyle = "#212529";
    ctx.fillText(label, column(azimuth), height / 2 - 60);
  }
  ctx.font = "32px system-ui, sans-serif";
  ctx.fillStyle = "#495057";
  for (let i = 0; i < 4; i += 1) {
    ctx.fillText(t.portal.tour.placeholder, (i + 0.5) * (width / 4), height / 2 + 80);
  }
  // JPEG: several times faster to encode than PNG for a gradient this size.
  const url = canvas.toDataURL("image/jpeg", 0.85);
  cache.set(key, url);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return url;
}
