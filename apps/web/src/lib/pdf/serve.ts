import { canAccessSection } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import type { DemoInfo } from "@/lib/demo/info";
import type { DemoPdfKind } from "@/lib/demo/pdf-cache";

// The two portal PDF routes (karne, envanter), with their order of checks:
// sign-in, the demo session gate, the section, the demo cap, the user's own
// row level security read, and only then, for a demo parcel, the shared demo
// cache (docs/demo-turu.md §11.6). Real users' PDFs are rendered per request
// and never cached. Dependencies are passed in, so the order is unit-tested.

export interface PdfDeps {
  user: () => Promise<SessionUser | null>;
  demoGate: (user: SessionUser) => Promise<boolean>;
  demoHit: () => Promise<boolean>;
  demoInfo: () => Promise<DemoInfo | null>;
  cached: (
    key: { kind: DemoPdfKind; parcelId: string; sessionId: string },
    render: () => Promise<Buffer>,
  ) => Promise<Buffer>;
}

export interface PdfJob<T> {
  kind: DemoPdfKind;
  parcelId: string;
  // The user's RLS read; null when there is nothing to print.
  load: () => Promise<T | null>;
  // The published session the PDF shows (part of the cache key).
  sessionOf: (data: T) => string;
  render: (data: T, demo: boolean) => Promise<Buffer>;
  fileName: (data: T) => string;
}

export async function servePdf<T>(deps: PdfDeps, job: PdfJob<T>): Promise<Response> {
  const user = await deps.user();
  if (!user) return new Response(null, { status: 401 });
  if (user.demo && !(await deps.demoGate(user))) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/demo/bitti", "Cache-Control": "private, no-store" },
    });
  }
  if (!canAccessSection(user.roles, "portal")) return new Response(null, { status: 403 });
  if (user.demo && !(await deps.demoHit())) return new Response(null, { status: 429 });

  const data = await job.load();
  if (!data) return new Response(null, { status: 404 });

  let body: Buffer;
  if (user.demo) {
    const info = await deps.demoInfo();
    const demoParcel = info?.parcels.some((p) => p.id === job.parcelId) ?? false;
    body = demoParcel
      ? await deps.cached(
          { kind: job.kind, parcelId: job.parcelId, sessionId: job.sessionOf(data) },
          () => job.render(data, true),
        )
      : await job.render(data, true);
  } else {
    body = await job.render(data, false);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${job.fileName(data)}"`,
    "Cache-Control": user.demo ? "private, max-age=600" : "private, no-store",
  };
  if (user.demo) headers["X-Orchados-Sample"] = "1";
  return new Response(new Uint8Array(body), { headers });
}
