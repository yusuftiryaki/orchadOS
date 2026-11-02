import { describe, expect, it } from "vitest";
import { parseDemoInfo } from "./info";
import { onStepPage, stepIndex, stepUrl, TOUR_STEPS } from "./tour-steps";

const CTX = {
  parcel_id: "p1",
  tree_id: "t1",
  session_id: "s2",
  previous_session_id: "s1",
  inventory_session_id: "i1",
  service_request_id: "r1",
};

describe("tour steps", () => {
  it("has twelve steps with unique ids, texts, targets and an href", () => {
    expect(TOUR_STEPS).toHaveLength(12);
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(12);
    for (const s of TOUR_STEPS) {
      expect(s.targets.length).toBeGreaterThan(0);
      expect(typeof s.href).toBe("function");
      expect(s.title).toBeTruthy();
      expect(s.body).toBeTruthy();
      if (!s.anyPage) expect(s.href(CTX)).toMatch(/^\/portal/);
    }
    expect(TOUR_STEPS[0].id).toBe("bahceler");
    expect(TOUR_STEPS[11].id).toBe("son");
    // The service steps come after the inspection steps, before the PDF.
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      "bahceler",
      "gezi",
      "harita",
      "karne",
      "bulgular",
      "agac",
      "ziyaret",
      "envanter",
      "hizmet-oneri",
      "hizmet-sonuc",
      "pdf",
      "son",
    ]);
  });

  it("builds the pages of the design", () => {
    const href = (id: string) => TOUR_STEPS[stepIndex(id)].href(CTX);
    expect(href("gezi")).toBe("/portal/parsel/p1/gezi");
    expect(href("harita")).toBe("/portal/parsel/p1?katman=isi");
    expect(href("agac")).toBe("/portal/parsel/p1/agac/t1");
    expect(href("ziyaret")).toBe("/portal/parsel/p1?ziyaret=s1");
    expect(href("envanter")).toBe("/portal/parsel/p1/envanter");
    expect(href("hizmet-oneri")).toBe("/portal/parsel/p1");
    expect(TOUR_STEPS[stepIndex("hizmet-oneri")].targets).toEqual(["service-offers"]);
    expect(href("hizmet-sonuc")).toBe("/portal/hizmetler/r1");
    expect(TOUR_STEPS[stepIndex("hizmet-sonuc")].targets).toEqual(["service-request-proof"]);
  });

  it("presents the service as done by the autonomous robot MARABA-I", () => {
    for (const id of ["hizmet-oneri", "hizmet-sonuc"]) {
      const { body } = TOUR_STEPS[stepIndex(id)];
      expect(body).toContain("otonom robotumuz MARABA-I");
      expect(body.toLowerCase()).not.toContain("tırpan");
    }
  });

  it("puts the step into ?tur and keeps the current page for the last step", () => {
    expect(stepUrl(TOUR_STEPS[2], CTX, "/portal")).toBe("/portal/parsel/p1?katman=isi&tur=harita");
    expect(stepUrl(TOUR_STEPS[11], CTX, "/portal/parsel/p1?x=1")).toBe(
      "/portal/parsel/p1?x=1&tur=son",
    );
  });

  it("skips steps without tour data", () => {
    expect(TOUR_STEPS[stepIndex("agac")].href({ parcel_id: "p1" })).toBeNull();
    // A dataset before version 2 has no service request in the tour.
    expect(TOUR_STEPS[stepIndex("hizmet-sonuc")].href({ parcel_id: "p1" })).toBeNull();
    expect(stepUrl(TOUR_STEPS[1], {}, "/portal")).toBeNull();
  });

  it("matches the step page exactly apart from ?tur", () => {
    const karne = TOUR_STEPS[stepIndex("karne")];
    const at = (q: string) => onStepPage(karne, CTX, "/portal/parsel/p1", new URLSearchParams(q));
    expect(at("tur=karne")).toBe(true);
    expect(at("ziyaret=s1&tur=karne")).toBe(false);
    expect(onStepPage(karne, CTX, "/portal", new URLSearchParams())).toBe(false);
  });

  it("reads the service request of the tour from demo_info()", () => {
    const info = parseDemoInfo({
      org_id: "o1",
      expires_at: "2026-11-02T12:00:00Z",
      tour: { parcel_id: "p1", service_request_id: "r1", other: "x" },
    });
    expect(info?.tour).toEqual({ parcel_id: "p1", service_request_id: "r1" });
  });
});
