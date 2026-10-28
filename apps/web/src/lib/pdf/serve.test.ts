import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import { servePdf, type PdfDeps, type PdfJob } from "./serve";

// The order of checks of the PDF routes (docs/demo-turu.md §11.6): the shared
// demo cache is consulted only after the visitor's own RLS read returned data,
// and only for a parcel of the visitor's demo.

const OWNER: SessionUser = {
  id: "u",
  email: null,
  roles: { orgRoles: [], parcelRoles: ["owner"], customer: false },
  demo: false,
} as unknown as SessionUser;
const VISITOR = { ...OWNER, demo: true } as SessionUser;

function setup(
  user: SessionUser | null,
  opts: { gate?: boolean; hit?: boolean; data?: boolean; parcels?: string[] } = {},
) {
  const events: string[] = [];
  const deps: PdfDeps = {
    user: async () => user,
    demoGate: async () => (events.push("gate"), opts.gate ?? true),
    demoHit: async () => (events.push("hit"), opts.hit ?? true),
    demoInfo: async () => (
      events.push("info"),
      {
        orgId: "o",
        expiresAt: "2999-01-01T00:00:00Z",
        tour: {},
        parcels: (opts.parcels ?? ["p"]).map((id) => ({ id, name: id })),
      }
    ),
    cached: vi.fn(async (_key, render) => (events.push("cache"), render())),
  };
  const job: PdfJob<{ id: string }> = {
    kind: "report",
    parcelId: "p",
    page: "/portal/parsel/p",
    load: async () => (events.push("load"), opts.data === false ? null : { id: "s" }),
    sessionOf: (d) => d.id,
    render: async (_d, demo) => (events.push(`render:${demo}`), Buffer.from("%PDF-")),
    fileName: () => "karne.pdf",
  };
  return { deps, job, events };
}

describe("servePdf", () => {
  it("real users: no cache, no demo calls, no-store", async () => {
    const { deps, job, events } = setup(OWNER);
    const res = await servePdf(deps, job);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Orchados-Sample")).toBeNull();
    expect(events).toEqual(["load", "render:false"]);
  });

  it("demo: gate, cap, RLS read, then the cache", async () => {
    const { deps, job, events } = setup(VISITOR);
    const res = await servePdf(deps, job);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=600");
    expect(res.headers.get("X-Orchados-Sample")).toBe("1");
    expect(events).toEqual(["gate", "hit", "load", "info", "cache", "render:true"]);
    expect(deps.cached).toHaveBeenCalledWith(
      { kind: "report", parcelId: "p", sessionId: "s" },
      expect.any(Function),
    );
  });

  it("demo: never the cache when the RLS read found nothing", async () => {
    const { deps, job, events } = setup(VISITOR, { data: false });
    expect((await servePdf(deps, job)).status).toBe(404);
    expect(deps.cached).not.toHaveBeenCalled();
    expect(events).not.toContain("cache");
  });

  it("demo: never the cache for a parcel outside the demo", async () => {
    const { deps, job, events } = setup(VISITOR, { parcels: ["other"] });
    expect((await servePdf(deps, job)).status).toBe(200);
    expect(deps.cached).not.toHaveBeenCalled();
    expect(events).toContain("render:true");
  });

  it("demo: an ended session is a 302 to /demo/bitti before anything else", async () => {
    const { deps, job, events } = setup(VISITOR, { gate: false });
    const res = await servePdf(deps, job);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/demo/bitti");
    expect(events).toEqual(["gate"]);
  });

  it("demo: over the cap goes back to the page with the notice, without reading", async () => {
    const { deps, job, events } = setup(VISITOR, { hit: false });
    const res = await servePdf(deps, job);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/portal/parsel/p?hata=demo_pdf_limit");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(events).toEqual(["gate", "hit"]);
  });

  it("signed out is 401", async () => {
    const { deps, job } = setup(null);
    expect((await servePdf(deps, job)).status).toBe(401);
  });
});
