import { describe, expect, it } from "vitest";
import {
  countReasons,
  followupMessage,
  parseFollowup,
  sortFollowups,
  type Followup,
} from "./followups";

const TREE = "11111111-1111-4111-8111-111111111111";

const item = (over: Partial<Followup>): Followup => ({
  id: "x",
  parcelId: "p",
  sourceSessionId: "s",
  kind: "closeup",
  treeId: TREE,
  note: null,
  status: "open",
  targetSessionId: null,
  createdAt: "2026-10-22T10:00:00Z",
  ...over,
});

describe("follow-up requests", () => {
  it("accepts a close-up or verification of a tree, note optional", () => {
    expect(parseFollowup("closeup", TREE, "  ")).toEqual({
      ok: true,
      kind: "closeup",
      treeId: TREE,
      note: null,
    });
    expect(parseFollowup("verification", TREE, " Ağaç var mı? ")).toMatchObject({
      note: "Ağaç var mı?",
    });
  });

  it("needs a tree for tree requests and a note for an extra visit", () => {
    expect(parseFollowup("closeup", null, "")).toEqual({ ok: false, error: "invalid_kind" });
    expect(parseFollowup("extra_visit", null, " ")).toEqual({ ok: false, error: "note_required" });
    expect(parseFollowup("extra_visit", null, "Sulama arızası")).toMatchObject({
      ok: true,
      treeId: null,
    });
    expect(parseFollowup("drone", TREE, "")).toEqual({ ok: false, error: "invalid_kind" });
    expect(parseFollowup("closeup", TREE, "x".repeat(2001))).toEqual({
      ok: false,
      error: "note_too_long",
    });
  });

  it("lists open requests first, then the newest", () => {
    const sorted = sortFollowups([
      item({ id: "done", status: "done", createdAt: "2026-10-23T00:00:00Z" }),
      item({ id: "old", status: "open", createdAt: "2026-10-01T00:00:00Z" }),
      item({ id: "planned", status: "planned" }),
      item({ id: "new", status: "open", createdAt: "2026-10-20T00:00:00Z" }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["new", "old", "planned", "done"]);
  });

  it("counts the reasons of the close-up list", () => {
    expect(
      countReasons([
        { treeId: "a", code: "S1-1", reasons: ["previous_class", "sample"] },
        { treeId: "b", code: "S1-2", reasons: ["sample"] },
        { treeId: "c", code: "S1-3", reasons: ["expert_request", "staff_problem"] },
      ]),
    ).toEqual({ previous_class: 1, sample: 2, staff_problem: 1, expert_request: 1 });
  });

  it("reads the result of a request from the URL", () => {
    expect(followupMessage({ takip: "1" })).toEqual({ saved: true, error: null });
    expect(followupMessage({ takip_hata: "note_required" })).toEqual({
      saved: false,
      error: "note_required",
    });
  });
});
