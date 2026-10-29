import { describe, expect, it } from "vitest";
import { onStepPage, stepIndex, stepUrl, TOUR_STEPS } from "./tour-steps";

const CTX = {
  parcel_id: "p1",
  tree_id: "t1",
  session_id: "s2",
  previous_session_id: "s1",
  inventory_session_id: "i1",
};

describe("tour steps", () => {
  it("has ten steps with unique ids, texts, targets and an href", () => {
    expect(TOUR_STEPS).toHaveLength(10);
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(10);
    for (const s of TOUR_STEPS) {
      expect(s.targets.length).toBeGreaterThan(0);
      expect(typeof s.href).toBe("function");
      expect(s.title).toBeTruthy();
      expect(s.body).toBeTruthy();
      if (!s.anyPage) expect(s.href(CTX)).toMatch(/^\/portal/);
    }
    expect(TOUR_STEPS[0].id).toBe("bahceler");
    expect(TOUR_STEPS[9].id).toBe("son");
  });

  it("builds the pages of the design", () => {
    const href = (id: string) => TOUR_STEPS[stepIndex(id)].href(CTX);
    expect(href("gezi")).toBe("/portal/parsel/p1/gezi");
    expect(href("harita")).toBe("/portal/parsel/p1?katman=isi");
    expect(href("agac")).toBe("/portal/parsel/p1/agac/t1");
    expect(href("ziyaret")).toBe("/portal/parsel/p1?ziyaret=s1");
    expect(href("envanter")).toBe("/portal/parsel/p1/envanter");
  });

  it("puts the step into ?tur and keeps the current page for the last step", () => {
    expect(stepUrl(TOUR_STEPS[2], CTX, "/portal")).toBe("/portal/parsel/p1?katman=isi&tur=harita");
    expect(stepUrl(TOUR_STEPS[9], CTX, "/portal/parsel/p1?x=1")).toBe(
      "/portal/parsel/p1?x=1&tur=son",
    );
  });

  it("skips steps without tour data", () => {
    expect(TOUR_STEPS[stepIndex("agac")].href({ parcel_id: "p1" })).toBeNull();
    expect(stepUrl(TOUR_STEPS[1], {}, "/portal")).toBeNull();
  });

  it("matches the step page exactly apart from ?tur", () => {
    const karne = TOUR_STEPS[stepIndex("karne")];
    const at = (q: string) => onStepPage(karne, CTX, "/portal/parsel/p1", new URLSearchParams(q));
    expect(at("tur=karne")).toBe(true);
    expect(at("ziyaret=s1&tur=karne")).toBe(false);
    expect(onStepPage(karne, CTX, "/portal", new URLSearchParams())).toBe(false);
  });
});
