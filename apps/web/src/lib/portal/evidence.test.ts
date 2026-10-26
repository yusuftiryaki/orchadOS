import { describe, expect, it } from "vitest";
import { checkHash, formatPosition, gpsNsToIso, sha256Hex, staffCode } from "./evidence";

describe("photo evidence", () => {
  it("converts GPS time to UTC (18 leap seconds)", () => {
    // 2026-10-14 06:30:00 UTC = GPS 2026-10-14 06:30:18.
    const gpsMs = Date.UTC(2026, 9, 14, 6, 30, 18) - Date.UTC(1980, 0, 6);
    expect(gpsNsToIso(`${gpsMs}123456`)).toBe("2026-10-14T06:30:00.000Z");
    expect(gpsNsToIso(null)).toBeNull();
    expect(gpsNsToIso("12a")).toBeNull();
  });

  it("shows staff by a stable short code", () => {
    expect(staffCode("a0000000-0000-4000-8000-000000000003")).toBe("A000");
    expect(staffCode(null)).toBeNull();
    expect(staffCode("x")).toBeNull();
  });

  it("formats a position to about a metre", () => {
    expect(formatPosition([37.381234567, 37.071234567])).toBe("37.07123, 37.38123");
    expect(formatPosition(null)).toBeNull();
  });

  it("verifies the SHA-256 of the downloaded bytes", async () => {
    const bytes = new TextEncoder().encode("abc");
    const hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(await sha256Hex(bytes.buffer as ArrayBuffer)).toBe(hash);
    const ok = (async () => new Response(bytes)) as unknown as typeof fetch;
    const missing = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const broken = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await checkHash("u", hash, ok)).toBe("match");
    expect(await checkHash("u", hash.replace("b", "c"), ok)).toBe("mismatch");
    expect(await checkHash("u", hash, missing)).toBe("error");
    expect(await checkHash("u", hash, broken)).toBe("error");
  });
});
