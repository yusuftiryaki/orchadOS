// Evidence of a photo on the tree card (docs/MVP.md Module 5: "her fotoğraf
// için tarih, saat, konum, çeken personel ve bütünlük doğrulaması"). Pure
// helpers; the rows come from src/lib/portal/data.ts.

// GPS time (ns since 1980-01-06, no leap seconds) to UTC: GPS is ahead of UTC
// by 18 s since 2017 (docs/arayuzler.md, "Zaman").
const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
const GPS_UTC_OFFSET_MS = 18_000;

export function gpsNsToIso(gpsTimeNs: string | null | undefined): string | null {
  if (!gpsTimeNs || !/^[0-9]{1,20}$/.test(gpsTimeNs)) return null;
  // Milliseconds fit a double exactly; drop the sub-millisecond digits as text.
  const ms = gpsTimeNs.length > 6 ? Number(gpsTimeNs.slice(0, -6)) : 0;
  const t = GPS_EPOCH_MS + ms - GPS_UTC_OFFSET_MS;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Staff are shown by a short, stable code, not by name or e-mail: the owner
// sees that the same person took the photos, ops and the expert can tell who.
export function staffCode(userId: string | null | undefined): string | null {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  return userId.replace(/-/g, "").slice(0, 4).toUpperCase();
}

// "37.07123 K, 37.38456 D" with 5 decimals (~1 m).
export function formatPosition(position: [number, number] | null): string | null {
  if (!position) return null;
  const [lon, lat] = position;
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export type HashCheck = "match" | "mismatch" | "error";

// SHA-256 of the bytes, lowercase hex, as content_hash stores it.
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkHash(
  url: string,
  expected: string,
  fetcher: typeof fetch = fetch,
): Promise<HashCheck> {
  try {
    const response = await fetcher(url);
    if (!response.ok) return "error";
    const actual = await sha256Hex(await response.arrayBuffer());
    return actual === expected.toLowerCase() ? "match" : "mismatch";
  } catch {
    return "error";
  }
}
