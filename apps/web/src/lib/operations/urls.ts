import type { OpsError } from "./mutations";

// Addresses of the operations screens and the result notices carried in them
// (?bilgi=<notice>, ?hata=<error>). Only known codes are read back, so a URL
// cannot put arbitrary text on the page.

export const NOTICES = [
  "registered",
  "saved",
  "access_granted",
  "access_revoked",
  "planned",
  "updated",
  "cancelled",
  "passive",
  "resumed",
  "invitation_approved",
  "invitation_rejected",
  "followups_planned",
] as const;
export type Notice = (typeof NOTICES)[number];

const ERRORS: OpsError[] = [
  "forbidden",
  "not_found",
  "invalid_input",
  "exists",
  "boundary_invalid",
  "lead_not_field_staff",
  "planned_date_required",
  "visit_not_planned",
  "visit_cancelled",
  "has_planned_visits",
  "parcel_passive",
  "parcel_removal_scheduled",
  "parcel_removed",
  "withdrawal_period_open",
  "installment_unpaid",
  "already_owner",
  "invite_unavailable",
  "conflict",
  "write_failed",
];

interface Result {
  notice?: Notice;
  error?: OpsError;
  // Version of a boundary just saved.
  boundary?: number;
}

function withResult(path: string, result: Result = {}): string {
  const q = new URLSearchParams();
  if (result.notice) q.set("bilgi", result.notice);
  if (result.error) q.set("hata", result.error);
  if (result.boundary) q.set("sinir", String(result.boundary));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export const opsHref = {
  dashboard: (result?: Result) => withResult("/operasyon", result),
  owners: () => "/operasyon/sahip",
  newOwner: () => "/operasyon/sahip/yeni",
  owner: (id: string, { saved }: { saved?: boolean } = {}) =>
    withResult(`/operasyon/sahip/${id}`, saved ? { notice: "saved" } : {}),
  newParcel: (ownerProfileId?: string) =>
    ownerProfileId ? `/operasyon/parsel/yeni?sahip=${ownerProfileId}` : "/operasyon/parsel/yeni",
  parcel: (id: string, result?: Result) => withResult(`/operasyon/parsel/${id}`, result),
  editParcel: (id: string) => `/operasyon/parsel/${id}/duzenle`,
  boundary: (id: string) => `/operasyon/parsel/${id}/sinir`,
  visits: (filters: Record<string, string | null | undefined> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/operasyon/ziyaret?${s}` : "/operasyon/ziyaret";
  },
  newVisit: (parcelId?: string) =>
    parcelId ? `/operasyon/ziyaret/yeni?parsel=${parcelId}` : "/operasyon/ziyaret/yeni",
  visit: (id: string, result?: Result) => withResult(`/operasyon/ziyaret/${id}`, result),
};

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function readResult(params: Params): Result {
  const notice = first(params.bilgi);
  const error = first(params.hata);
  const boundary = Number(first(params.sinir));
  return {
    notice: (NOTICES as readonly string[]).includes(notice ?? "") ? (notice as Notice) : undefined,
    error: ERRORS.includes(error as OpsError) ? (error as OpsError) : undefined,
    boundary: Number.isInteger(boundary) && boundary > 0 ? boundary : undefined,
  };
}
