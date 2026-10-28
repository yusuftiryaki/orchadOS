import { describe, expect, it } from "vitest";
import { seasonOf } from "@/lib/expert/season";
import { remainingVisitWindows, VISIT_WINDOWS } from "./visit-windows";

const labels = (from: string, to: string) => remainingVisitWindows(from, to).map((w) => w.label);

// The same cases as supabase/tests/54_addon_breakdown.test.sql.
describe("contract visit windows (Ek-2)", () => {
  it("lists the four windows", () => {
    expect(VISIT_WINDOWS.map((w) => [w.name, w.startMonth, w.endMonth])).toEqual([
      ["Kış", 12, 2],
      ["İlkbahar", 4, 5],
      ["Yaz", 6, 7],
      ["Hasat", 8, 10],
    ]);
  });

  it("counts a partly elapsed window while one of its days is left", () => {
    expect(labels("2026-05-15", "2027-01-10")).toEqual([
      "İlkbahar 2026",
      "Yaz 2026",
      "Hasat 2026",
      "Kış 2026–2027",
    ]);
  });

  it("leaves March and November out", () => {
    expect(labels("2026-11-01", "2027-03-31")).toEqual(["Kış 2026–2027"]);
    expect(labels("2026-03-01", "2026-03-31")).toEqual([]);
    expect(labels("2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("meets the winter twice in a year from mid-January", () => {
    expect(labels("2026-01-15", "2027-01-14")).toEqual([
      "Kış 2025–2026",
      "İlkbahar 2026",
      "Yaz 2026",
      "Hasat 2026",
      "Kış 2026–2027",
    ]);
  });

  it("counts the last day of a window, with dates", () => {
    expect(remainingVisitWindows("2027-02-28", "2027-02-28")).toEqual([
      { code: "winter", name: "Kış", label: "Kış 2026–2027", start: "2026-12-01", end: "2027-02-28" },
    ]);
    expect(remainingVisitWindows("2028-02-29", "2028-02-29")[0].end).toBe("2028-02-29");
  });

  it("differs on purpose from the evaluation calendar (seasonOf unchanged)", () => {
    expect(seasonOf("2026-03-15")).toBe("spring");
    expect(seasonOf("2026-11-15")).toBe("winter");
    expect(labels("2026-03-15", "2026-03-15")).toEqual([]);
  });
});
