import "server-only";
import { unstable_cache } from "next/cache";

// Demo PDFs are the same for every visitor (docs/demo-turu.md §11.6), so the
// rendered bytes are shared through Next's data cache. Callers consult it only
// after the visitor's own RLS read succeeded and only for a demo parcel
// (lib/pdf/serve.ts). Base64, because the cache stores JSON; anything above
// MAX_BYTES is rendered each time instead.

export const MAX_CACHED_BYTES = 1.9 * 1024 * 1024;
// Bumped when the PDF layout changes; new data versions add sessions, which
// change the key anyway.
const LAYOUT_VERSION = "1";

export type DemoPdfKind = "report" | "inventory";

export async function cachedDemoPdf(
  key: { kind: DemoPdfKind; parcelId: string; sessionId: string },
  render: () => Promise<Buffer>,
): Promise<Buffer> {
  const load = unstable_cache(
    async (): Promise<string | null> => {
      const body = await render();
      return body.length > MAX_CACHED_BYTES ? null : body.toString("base64");
    },
    ["demo-pdf", LAYOUT_VERSION, key.kind, key.parcelId, key.sessionId],
    { revalidate: 24 * 3600 },
  );
  const cached = await load();
  return cached === null ? render() : Buffer.from(cached, "base64");
}
