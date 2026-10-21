import { describe, expect, it } from "vitest";
import { LocalFrame } from "./local-frame";
import { sortReasons, verificationCandidates, type CandidateSlot } from "./verification-candidates";

const frame = new LocalFrame(37.03, 37.41);

function slot(code: string, x: number, partial: Partial<CandidateSlot> = {}): CandidateSlot {
  return {
    id: code,
    code,
    kind: code.match(/[a-z]$/) ? "interstitial" : "row",
    position: frame.toLatLon({ x, y: 0 }),
    uncertaintyM: 0.2,
    treeId: `t-${code}`,
    unsure: false,
    ...partial,
  };
}

describe("verificationCandidates", () => {
  const slots = [
    slot("S1-1", 0),
    slot("S1-2", 6, { uncertaintyM: 0.8 }),
    slot("S1-3", 12, { treeId: null }),
    slot("S1-4", 18, { unsure: true, uncertaintyM: 0.9 }),
    slot("S1-4a", 18.6),
    slot("S1-5", 24),
    slot("S1-5a", 27),
  ];

  it("lists unsure, uncertain, empty and probable multi-stem slots", () => {
    expect(verificationCandidates(slots)).toEqual([
      { slotId: "S1-2", code: "S1-2", treeId: "t-S1-2", reasons: ["high_uncertainty"] },
      { slotId: "S1-3", code: "S1-3", treeId: null, reasons: ["empty_slot"] },
      {
        slotId: "S1-4",
        code: "S1-4",
        treeId: "t-S1-4",
        reasons: ["high_uncertainty", "unsure"],
      },
      { slotId: "S1-4a", code: "S1-4a", treeId: "t-S1-4a", reasons: ["multi_stem"] },
    ]);
  });

  it("leaves out slots already on an open item", () => {
    const codes = verificationCandidates(slots, { exclude: new Set(["S1-3", "S1-4"]) }).map(
      (c) => c.code,
    );
    expect(codes).toEqual(["S1-2", "S1-4a"]);
  });

  it("takes the limits as options", () => {
    const codes = verificationCandidates(slots, { maxUncertaintyM: 1, multiStemM: 0.5 }).map(
      (c) => c.code,
    );
    expect(codes).toEqual(["S1-3", "S1-4"]);
  });

  it("sorts reasons in the database order", () => {
    expect(sortReasons(["other", "unsure", "empty_slot", "unsure"])).toEqual([
      "empty_slot",
      "unsure",
      "other",
    ]);
  });
});
