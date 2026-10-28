import { describe, expect, it } from "vitest";
import type { Position } from "@/lib/map/geo";
import type { TourPanorama } from "./tour";
import {
  addSigned,
  assetOfKind,
  chooseImage,
  compassPoint,
  dropStale,
  escapeHtml,
  idsToSign,
  preloadUrls,
  SIGNED_URL_REFRESH_MS,
  tourNeighbours,
  tourSearch,
  tourStart,
} from "./tour-view";

const origin: Position = [37.45, 37.0];
// Point `e` metres east and `n` metres north of the origin.
const at = (e: number, n: number): Position => {
  const lat = origin[1] + n / 111_195.08;
  const lng = origin[0] + e / (111_195.08 * Math.cos((((origin[1] + lat) / 2) * Math.PI) / 180));
  return [lng, lat];
};
const pano = (
  id: string,
  e: number,
  n: number,
  headingDeg = 0,
  assets: { full?: string | null; preview?: string | null } = {},
): TourPanorama => ({
  id,
  position: at(e, n),
  headingDeg,
  fullAssetId: assets.full === undefined ? `${id}-full` : assets.full,
  previewAssetId: assets.preview === undefined ? `${id}-prev` : assets.preview,
});

// A row of panoramas 8 m apart, heading east (as the crew drives a row), and
// a second row 8 m north.
const row = [0, 1, 2, 3].map((i) => pano(`a${i}`, i * 8, 0, 90));
const north = [0, 1].map((i) => pano(`b${i}`, i * 8, 8, 270));
const visits = [{ panoramas: [...row, ...north] }, { panoramas: [pano("old", 0.5, 0.5, 90)] }];

describe("where the tour opens", () => {
  it("opens ?panorama= in its own visit", () => {
    const start = tourStart(visits, { panoramaId: "old", lookAt: null })!;
    expect(start.visitIndex).toBe(1);
    expect(start.panorama.id).toBe("old");
    expect(start.lookYawDeg).toBe(0);
  });

  it("opens the panorama nearest to a tree, turned towards it", () => {
    // Tree 2 m south of a2: the camera heads east, so the tree is 90° right.
    const start = tourStart(visits, { panoramaId: null, lookAt: at(16, -2) })!;
    expect(start.visitIndex).toBe(0);
    expect(start.panorama.id).toBe("a2");
    expect(start.lookYawDeg).toBeCloseTo(90, 3);
  });

  it("falls back to the newest visit's first panorama for an unknown id", () => {
    const start = tourStart(visits, { panoramaId: "gone", lookAt: null })!;
    expect(start.panorama.id).toBe("a0");
    expect(tourStart([], { panoramaId: null, lookAt: null })).toBeNull();
    expect(tourStart([{ panoramas: [] }], { panoramaId: null, lookAt: null })).toBeNull();
  });
});

describe("arrows (neighbours) and walking along a row", () => {
  it("offers the next and previous panorama of the row and the row beside", () => {
    const n = tourNeighbours(visits[0].panoramas, row[1]);
    // Sorted by azimuth: north (b1, 0°), north-east... east (a2), west (a0).
    const ids = n.map((x) => x.panorama.id);
    expect(ids).toContain("a2");
    expect(ids).toContain("a0");
    expect(ids).toContain("b1");
    expect(ids).not.toContain("a3"); // behind a2 in the same direction
    const east = n.find((x) => x.panorama.id === "a2")!;
    expect(east.yawDeg).toBeCloseTo(0, 3); // straight ahead
    expect(compassPoint(east.azimuthDeg)).toBe("E");
    const west = n.find((x) => x.panorama.id === "a0")!;
    expect(Math.abs(west.yawDeg)).toBeCloseTo(180, 3); // behind
    expect(compassPoint(west.azimuthDeg)).toBe("W");
  });

  it("names the 8 compass directions", () => {
    expect([0, 44, 46, 90, 135, 180, 225, 270, 315, 337, 338, -10].map(compassPoint)).toEqual([
      "N",
      "NE",
      "NE",
      "E",
      "SE",
      "S",
      "SW",
      "W",
      "NW",
      "NW",
      "N",
      "N",
    ]);
  });

  it("walks the whole row with the arrow straight ahead and back", () => {
    let here = row[0];
    const path = [here.id];
    for (let i = 0; i < 3; i += 1) {
      const ahead = tourNeighbours(visits[0].panoramas, here).find((x) => Math.abs(x.yawDeg) < 1)!;
      here = ahead.panorama as TourPanorama;
      path.push(here.id);
    }
    expect(path).toEqual(["a0", "a1", "a2", "a3"]);
    // At the end of the row there is nothing straight ahead.
    expect(tourNeighbours(visits[0].panoramas, here).some((x) => Math.abs(x.yawDeg) < 1)).toBe(
      false,
    );
  });
});

describe("signed images", () => {
  const now = 1_000_000_000;

  it("signs the current panorama and the neighbours' opening images once", () => {
    const n = tourNeighbours(visits[0].panoramas, row[1]).map((x) => x.panorama);
    const ids = idsToSign(row[1], n, {});
    expect(ids.slice(0, 2)).toEqual(["a1-prev", "a1-full"]);
    expect(ids).toContain("a2-prev");
    expect(ids).not.toContain("a2-full");
    const signed = addSigned({}, Object.fromEntries(ids.map((id) => [id, `u/${id}`])), now);
    expect(idsToSign(row[1], n, signed)).toEqual([]);
    // A neighbour without a preview opens with its full image.
    const noPreview = pano("x", 4, 0, 0, { preview: null });
    expect(idsToSign(row[0], [noPreview], {})).toEqual(["a0-prev", "a0-full", "x-full"]);
  });

  it("signs again URLs about to expire, but never asks again for missing ones", () => {
    const signed = {
      fresh: { url: "u1", at: now - 60_000 },
      old: { url: "u2", at: now - SIGNED_URL_REFRESH_MS },
      missing: { url: null, at: now - 2 * SIGNED_URL_REFRESH_MS },
    };
    const next = dropStale(signed, ["fresh", "old", "missing"], now);
    expect(Object.keys(next).sort()).toEqual(["fresh", "missing"]);
    // Nothing stale: the same object (no re-render).
    expect(dropStale(next, ["fresh", "missing"], now)).toBe(next);
    // Only the ids asked about.
    expect(dropStale(signed, ["fresh"], now)).toBe(signed);
  });

  it("shows the preview first, then the full image on zoom", () => {
    const p = row[0];
    expect(chooseImage(p, {})).toEqual({ status: "pending" });
    const signed = addSigned({}, { "a0-prev": "prev", "a0-full": "full" }, now);
    expect(chooseImage(p, signed)).toEqual({
      status: "ready",
      url: "prev",
      kind: "preview",
      fullUrl: "full",
    });
    // Preview signed, full image still on its way: the preview opens.
    expect(chooseImage(p, addSigned({}, { "a0-prev": "prev" }, now))).toMatchObject({
      status: "ready",
      url: "prev",
      fullUrl: null,
    });
  });

  it("falls back from a broken preview to the full image, then to the placeholder", () => {
    const p = row[0];
    const signed = addSigned({}, { "a0-prev": "prev", "a0-full": "full" }, now);
    expect(chooseImage(p, signed, new Set(["prev"]))).toEqual({
      status: "ready",
      url: "full",
      kind: "full",
      fullUrl: null,
    });
    expect(chooseImage(p, signed, new Set(["prev", "full"]))).toEqual({ status: "missing" });
    // A broken full image never replaces a working preview.
    expect(chooseImage(p, signed, new Set(["full"]))).toMatchObject({
      url: "prev",
      fullUrl: null,
    });
    // Missing or refused (null) and panoramas without any image.
    expect(chooseImage(p, addSigned({}, { "a0-prev": null, "a0-full": null }, now))).toEqual({
      status: "missing",
    });
    expect(chooseImage(pano("none", 0, 0, 0, { full: null, preview: null }), {})).toEqual({
      status: "missing",
    });
    // Preview missing, full image still being signed: wait for it.
    expect(chooseImage(p, addSigned({}, { "a0-prev": null }, now))).toEqual({
      status: "pending",
    });
  });

  it("maps a failed image to its asset", () => {
    expect(assetOfKind(row[0], "preview")).toBe("a0-prev");
    expect(assetOfKind(row[0], "full")).toBe("a0-full");
    expect(assetOfKind(row[0], "placeholder")).toBeNull();
  });
});

describe("preloading", () => {
  const n = tourNeighbours(visits[0].panoramas, row[1]);
  const signed = addSigned(
    {},
    Object.fromEntries([...row, ...north].map((p) => [p.previewAssetId!, `u/${p.previewAssetId}`])),
    0,
  );

  it("downloads ahead the neighbours nearest to the view direction", () => {
    // Looking ahead (east): a2 first; looking back: a0 first.
    expect(preloadUrls(n, 0, signed, 1)).toEqual(["u/a2-prev"]);
    expect(preloadUrls(n, 180, signed, 1)).toEqual(["u/a0-prev"]);
    expect(preloadUrls(n, 0, signed).length).toBeLessThanOrEqual(3);
  });

  it("only preloads signed images", () => {
    expect(preloadUrls(n, 0, {})).toEqual([]);
    expect(preloadUrls(n, 0, addSigned({}, { "a2-prev": null }, 0))).toEqual([]);
  });
});

describe("the tour's address", () => {
  it("keeps other parameters and drops the start tree", () => {
    expect(tourSearch("", "p1")).toBe("?panorama=p1");
    expect(tourSearch("?agac=t1", "p1")).toBe("?panorama=p1");
    expect(tourSearch("?tur=gezi&panorama=p0", "p1")).toBe("?tur=gezi&panorama=p1");
  });
});

describe("marker text", () => {
  it("escapes HTML in tree codes", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      "&#60;img src=x onerror=&#34;alert(&#39;x&#39;)&#34;&#62;&#38;",
    );
    expect(escapeHtml("S1-2")).toBe("S1-2");
  });
});
