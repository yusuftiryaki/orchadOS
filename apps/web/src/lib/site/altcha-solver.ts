// Browser side of the self-hosted robot check (docs/hukuk/kararlar.md H03,
// T12): finds the number whose SHA-256 with the salt is the challenge, with
// Web Crypto only (no external script, no third-party request).

export interface AltchaChallengeData {
  algorithm: string;
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

// The number, or null when none up to maxnumber matches (or `signal` stops
// the search). Hashes in batches so the page stays responsive.
export async function solveAltcha(
  c: AltchaChallengeData,
  signal?: AbortSignal,
  batch = 500,
): Promise<number | null> {
  if (c.algorithm !== "SHA-256") return null;
  for (let start = 0; start <= c.maxnumber; start += batch) {
    if (signal?.aborted) return null;
    const end = Math.min(start + batch - 1, c.maxnumber);
    const hashes = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) =>
        crypto.subtle.digest("SHA-256", encoder.encode(`${c.salt}${start + i}`)),
      ),
    );
    const found = hashes.findIndex((h) => hex(h) === c.challenge);
    if (found >= 0) return start + found;
  }
  return null;
}

// The value of the form field: base64 of the payload (the ALTCHA format).
export function altchaPayload(c: AltchaChallengeData, number: number): string {
  return btoa(
    JSON.stringify({
      algorithm: c.algorithm,
      challenge: c.challenge,
      number,
      salt: c.salt,
      signature: c.signature,
    }),
  );
}

export function isAltchaChallenge(value: unknown): value is AltchaChallengeData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.algorithm === "SHA-256" &&
    typeof v.challenge === "string" &&
    /^[0-9a-f]{64}$/.test(v.challenge) &&
    typeof v.salt === "string" &&
    v.salt.length <= 200 &&
    typeof v.signature === "string" &&
    Number.isSafeInteger(v.maxnumber) &&
    (v.maxnumber as number) >= 0 &&
    (v.maxnumber as number) <= 10_000_000
  );
}
