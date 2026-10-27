// Return origin check for payments/start (docs/musteri-yonetimi.md §8.4).
//
// - The value must be exactly a URL origin: no path (not even "/"), query,
//   hash or credentials.
// - https only, except http://localhost and http://127.0.0.1.
// - An entry of PAYMENT_RETURN_ORIGINS matches exactly. An entry with "*" is a
//   pattern (preview deployments) and is used only when allowPreview
//   (PAYMENT_ALLOW_PREVIEW_ORIGINS=1, test project only); "*" matches
//   [a-z0-9-]+, never a dot.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function parseOriginList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function patternRegex(pattern: string): RegExp {
  const body = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
    .join("[a-z0-9-]+");
  return new RegExp(`^${body}$`);
}

export function isAllowedReturnOrigin(
  origin: string,
  list: string[] | string | undefined,
  allowPreview: boolean,
): boolean {
  if (typeof origin !== "string" || origin === "" || origin.length > 200) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    return false;
  }
  const entries = Array.isArray(list) ? list : parseOriginList(list);
  return entries.some((entry) =>
    entry.includes("*") ? allowPreview && patternRegex(entry).test(origin) : entry === origin,
  );
}
