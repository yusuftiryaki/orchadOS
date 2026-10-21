import { FILTERS, type Filter } from "./summary";

// Addresses of the expert panel. Query parameters are Turkish like the paths.

export const FILTER_PARAM: Record<Filter, string> = {
  all: "tum",
  unreviewed: "incelenmemis",
  mandatory: "zorunlu",
  sample: "orneklem",
  flagged: "sorunlu",
  low_confidence: "dusuk-guven",
};

export function parseFilter(value: unknown): Filter {
  return FILTERS.find((f) => FILTER_PARAM[f] === value) ?? "all";
}

export interface ReviewParams {
  tree?: string | null;
  filter?: Filter;
  error?: string | null;
  metric?: string | null;
  saved?: boolean;
}

function query(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) q.set(key, value);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function reviewHref(sessionId: string, p: ReviewParams = {}): string {
  return `/uzman/ziyaret/${sessionId}${query({
    filtre: p.filter && p.filter !== "all" ? FILTER_PARAM[p.filter] : null,
    agac: p.tree,
    hata: p.error,
    metrik: p.metric,
    kayit: p.saved ? "1" : null,
  })}`;
}

export function summaryHref(
  sessionId: string,
  p: { error?: string | null; published?: boolean } = {},
): string {
  return `/uzman/ziyaret/${sessionId}/ozet${query({
    hata: p.error,
    yayin: p.published ? "1" : null,
  })}`;
}

// A return path from a form must stay inside the visit's pages.
export function safeReturnPath(value: unknown, sessionId: string): string {
  const base = `/uzman/ziyaret/${sessionId}`;
  if (
    typeof value === "string" &&
    (value === base || value.startsWith(`${base}/`) || value.startsWith(`${base}?`))
  ) {
    return value;
  }
  return base;
}

// Adds or replaces one query parameter of a same-origin path.
export function withParam(path: string, key: string, value: string | null): string {
  const url = new URL(path, "http://x");
  if (value == null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
