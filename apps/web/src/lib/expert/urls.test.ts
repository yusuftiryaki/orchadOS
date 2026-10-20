import { describe, expect, it } from "vitest";
import { mediaObjectName } from "./media";
import { parseFilter, reviewHref, safeReturnPath, summaryHref, withParam } from "./urls";
import { validateFinding } from "./findings";

const S = "e1000000-0000-4000-8000-000000000002";

describe("review addresses", () => {
  it("round-trips filters and leaves defaults out", () => {
    expect(reviewHref(S)).toBe(`/uzman/ziyaret/${S}`);
    expect(reviewHref(S, { filter: "unreviewed", tree: "t1", saved: true })).toBe(
      `/uzman/ziyaret/${S}?filtre=incelenmemis&agac=t1&kayit=1`,
    );
    expect(parseFilter("dusuk-guven")).toBe("low_confidence");
    expect(parseFilter("sorunlu")).toBe("flagged");
    expect(parseFilter(undefined)).toBe("all");
    expect(parseFilter("x")).toBe("all");
    expect(summaryHref(S, { published: true })).toBe(`/uzman/ziyaret/${S}/ozet?yayin=1`);
  });

  it("keeps return paths inside the visit", () => {
    expect(safeReturnPath(`/uzman/ziyaret/${S}/ozet`, S)).toBe(`/uzman/ziyaret/${S}/ozet`);
    expect(safeReturnPath(`/uzman/ziyaret/${S}?agac=x`, S)).toBe(`/uzman/ziyaret/${S}?agac=x`);
    expect(safeReturnPath("https://evil.example/", S)).toBe(`/uzman/ziyaret/${S}`);
    expect(safeReturnPath(`/uzman/ziyaret/${S}x`, S)).toBe(`/uzman/ziyaret/${S}`);
    expect(safeReturnPath(null, S)).toBe(`/uzman/ziyaret/${S}`);
  });

  it("sets and removes one query parameter", () => {
    expect(withParam("/a?x=1", "e", "bad")).toBe("/a?x=1&e=bad");
    expect(withParam("/a?x=1&e=bad", "e", null)).toBe("/a?x=1");
  });
});

describe("mediaObjectName", () => {
  it("strips the bucket prefix and ignores other locations", () => {
    expect(mediaObjectName("storage://media/org/o/parcel/p/abc")).toBe("org/o/parcel/p/abc");
    expect(mediaObjectName("station://raw/x.insv")).toBeNull();
    expect(mediaObjectName("storage://media/")).toBeNull();
  });
});

describe("validateFinding", () => {
  const base = {
    sessionId: S,
    treeId: null,
    kind: "dead_branch",
    severity: "medium",
    description: "  Kuru dal.  ",
    recommendation: " ",
    evidenceAssetIds: [S, S],
  };
  it("trims text and de-duplicates evidence", () => {
    expect(validateFinding(base)).toEqual({
      sessionId: S,
      treeId: null,
      kind: "dead_branch",
      severity: "medium",
      description: "Kuru dal.",
      recommendation: null,
      evidence: [S],
    });
    expect(validateFinding({ ...base, evidenceAssetIds: null })?.evidence).toBeNull();
  });
  it("rejects bad kinds, severities, empty text and bad ids", () => {
    expect(validateFinding({ ...base, kind: "Dead Branch" })).toBeNull();
    expect(validateFinding({ ...base, severity: "critical" })).toBeNull();
    expect(validateFinding({ ...base, description: " " })).toBeNull();
    expect(validateFinding({ ...base, treeId: "x" })).toBeNull();
    expect(validateFinding({ ...base, evidenceAssetIds: ["x"] })).toBeNull();
  });
});
