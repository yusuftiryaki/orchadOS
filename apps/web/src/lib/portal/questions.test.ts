import { describe, expect, it } from "vitest";
import { filterThreads, openCount, parseQuestionFilter } from "@/lib/expert/questions";
import { EDIT_WINDOW_MS, buildThreads, canEdit, parseBody, writeError } from "./questions";

const NOW = Date.parse("2026-11-01T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const question = (id: string, createdBy: string, minutesAgo: number) => ({
  id,
  parcel_id: "p",
  tree_id: "t",
  finding_id: null,
  body: `q ${id}`,
  author_role: "owner" as const,
  created_by: createdBy,
  created_at: ago(minutesAgo),
  edited_at: null,
  parcel: { name: "Bahçe" },
  tree: { slot: { code: "S1-1" } },
  finding: null,
});
const reply = (
  id: string,
  questionId: string,
  role: "owner" | "expert" | "ops" | "viewer",
  createdBy: string,
  minutesAgo: number,
) => ({
  id,
  question_id: questionId,
  body: `r ${id}`,
  author_role: role,
  created_by: createdBy,
  created_at: ago(minutesAgo),
  edited_at: null,
});

describe("parseBody", () => {
  it("trims and limits the text", () => {
    expect(parseBody("  Neden?  ")).toEqual({ ok: true, body: "Neden?" });
    expect(parseBody("   ")).toEqual({ ok: false, error: "empty" });
    expect(parseBody(null)).toEqual({ ok: false, error: "empty" });
    expect(parseBody("x".repeat(2001))).toEqual({ ok: false, error: "too_long" });
    expect(parseBody("x".repeat(2000)).ok).toBe(true);
  });
});

describe("canEdit", () => {
  it("lets only the author edit, within 15 minutes", () => {
    expect(EDIT_WINDOW_MS).toBe(15 * 60_000);
    expect(canEdit(true, ago(14), NOW)).toBe(true);
    expect(canEdit(true, ago(16), NOW)).toBe(false);
    expect(canEdit(false, ago(1), NOW)).toBe(false);
  });
});

describe("buildThreads", () => {
  const threads = buildThreads(
    [question("q1", "owner", 120), question("q2", "owner", 60), question("q3", "viewer", 5)],
    [
      reply("r2", "q1", "expert", "expert", 30),
      reply("r1", "q1", "owner", "owner", 90),
      reply("r3", "q2", "expert", "expert", 50),
      reply("r4", "q2", "owner", "owner", 10),
    ],
    "owner",
    NOW,
  );

  it("orders messages and marks the answered threads", () => {
    const q1 = threads.find((t) => t.id === "q1")!;
    expect(q1.messages.map((m) => m.id)).toEqual(["q1", "r1", "r2"]);
    expect(q1.answered).toBe(true);
    // A follow-up after the answer opens the thread again.
    expect(threads.find((t) => t.id === "q2")!.answered).toBe(false);
    expect(threads.find((t) => t.id === "q3")!.answered).toBe(false);
    expect(q1.treeCode).toBe("S1-1");
  });

  it("lists open threads first, newest activity first", () => {
    expect(threads.map((t) => t.id)).toEqual(["q3", "q2", "q1"]);
  });

  it("marks the user's own messages and what is still editable", () => {
    const q2 = threads.find((t) => t.id === "q2")!;
    expect(q2.messages.map((m) => [m.id, m.mine, m.editable])).toEqual([
      ["q2", true, false],
      ["r3", false, false],
      ["r4", true, true],
    ]);
  });

  it("filters for the expert", () => {
    expect(parseQuestionFilter("tum")).toBe("all");
    expect(parseQuestionFilter(undefined)).toBe("open");
    expect(filterThreads(threads, "open").map((t) => t.id)).toEqual(["q3", "q2"]);
    expect(filterThreads(threads, "all")).toHaveLength(3);
    expect(openCount(threads)).toBe(2);
  });
});

describe("write errors", () => {
  it("maps the read-only guard of a removed garden (IP14)", () => {
    // Not the generic "kaydedilemedi": the guard has its own text.
    expect(writeError({ code: "P0001", message: "parcel_read_only" })).toEqual({
      ok: false,
      error: "parcel_read_only",
    });
    expect(writeError({ code: "42501", message: "demo_read_only" })).toEqual({
      ok: false,
      error: "demo_read_only",
    });
    expect(writeError({ code: "P0001", message: "other" })).toEqual({
      ok: false,
      error: "write_failed",
    });
  });
});
