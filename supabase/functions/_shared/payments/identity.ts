// T13 (kararlar.md H16): the buyer's TCKN at card payment. It arrives in the
// start request body (the web server action), goes into the provider request
// only, and only its last four digits reach the database
// (payment_attach_token). It is never logged, stored, put into an event
// payload or an error. Pure TypeScript: the web app's tests import this file.

// Same check digits as the database (private.is_valid_tckn) and the web app
// (apps/web/src/lib/portal-billing/tckn.ts).
export function isValidTckn(value: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  const sum = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return tenth === d[9] && sum % 10 === d[10];
}

// The provider's placeholder when the org does not need a TCKN.
export const PLACEHOLDER_TCKN = "11111111111";

// "absent": no identity_number in the body; "invalid": present but not a
// well-formed TCKN (the caller answers without echoing it).
export function readTckn(body: Record<string, unknown>): string | "absent" | "invalid" {
  const raw = body.identity_number;
  if (raw === undefined || raw === null) return "absent";
  if (typeof raw !== "string") return "invalid";
  const value = raw.replace(/\s/g, "");
  return isValidTckn(value) ? value : "invalid";
}

// 11 digits in a row anywhere in a text: a TCKN-shaped value.
export const TCKN_PATTERN = /(?<![0-9])[1-9][0-9]{10}(?![0-9])/;
