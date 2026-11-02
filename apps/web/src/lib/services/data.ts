import type { Database } from "@/lib/database.types";
import type { MediaSigner } from "@/lib/media/signer";
import { fetchAll, isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import { ownWorkDays, ownWorkQueryRange, OWN_WORK_KINDS } from "./independence";
import type { ServiceOffer } from "./offers";

// Reads of the service layer (IP15) as the signed-in user: row level security
// decides. Owners read their own requests, history and, once a job is done,
// its proof photos; co-owners (viewers) read none of them and get no offers.

export type ServiceRequestRow = Pick<
  Database["public"]["Tables"]["service_request"]["Row"],
  | "id"
  | "parcel_id"
  | "service_type_id"
  | "number"
  | "status"
  | "season_year"
  | "preferred_window"
  | "customer_note"
  | "terms_version"
  | "early_performance_requested"
  | "area_m2"
  | "area_source"
  | "price_per_donum_kurus"
  | "minimum_fee_kurus"
  | "vat_rate_bp"
  | "price_is_draft"
  | "estimate_subtotal_kurus"
  | "estimate_vat_kurus"
  | "estimate_total_kurus"
  | "quote_total_kurus"
  | "scheduled_date"
  | "session_id"
  | "completed_on"
  | "cancelled_at"
  | "cancelled_by_role"
  | "cancel_reason"
  | "payment_received_on"
  | "created_at"
>;

// Not ops_note (internal, not granted to owners) and not who recorded the
// payment.
const REQUEST_COLUMNS =
  "id, parcel_id, service_type_id, number, status, season_year, preferred_window, customer_note, terms_version, early_performance_requested, area_m2, area_source, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp, price_is_draft, estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus, quote_total_kurus, scheduled_date, session_id, completed_on, cancelled_at, cancelled_by_role, cancel_reason, payment_received_on, created_at";

export interface ServiceRequestItem extends ServiceRequestRow {
  parcelName: string;
  serviceName: string;
  serviceCode: string;
}

// Offer cards of every parcel the caller owns, or of one parcel. Empty when
// the switch is off, for co-owners, and for a parcel without a known area.
export async function listServiceOffers(
  supabase: Client,
  parcelId?: string,
): Promise<ServiceOffer[]> {
  if (parcelId !== undefined && !isUuid(parcelId)) return [];
  const { data, error } = await supabase.rpc(
    "service_offers",
    parcelId ? { p_parcel_id: parcelId } : {},
  );
  if (error) throw error;
  return data ?? [];
}

export async function findServiceOffer(
  supabase: Client,
  parcelId: string,
  serviceTypeId: string,
): Promise<ServiceOffer | null> {
  if (!isUuid(parcelId) || !isUuid(serviceTypeId)) return null;
  const offers = await listServiceOffers(supabase, parcelId);
  return offers.find((o) => o.service_type_id === serviceTypeId) ?? null;
}

async function withNames(supabase: Client, rows: ServiceRequestRow[]) {
  const parcelIds = [...new Set(rows.map((r) => r.parcel_id))];
  const typeIds = [...new Set(rows.map((r) => r.service_type_id))];
  const [parcels, types] = await Promise.all([
    parcelIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("parcel").select("id, name").in("id", parcelIds),
    typeIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("service_type").select("id, name, code").in("id", typeIds),
  ]);
  if (parcels.error) throw parcels.error;
  if (types.error) throw types.error;
  const parcelName = new Map((parcels.data ?? []).map((p) => [p.id, p.name]));
  const type = new Map((types.data ?? []).map((t) => [t.id, t]));
  return rows.map((r) => ({
    ...r,
    parcelName: parcelName.get(r.parcel_id) ?? "",
    serviceName: type.get(r.service_type_id)?.name ?? "",
    serviceCode: type.get(r.service_type_id)?.code ?? "",
  }));
}

// The caller's requests, newest first ("Hizmetlerim").
export async function listServiceRequests(supabase: Client): Promise<ServiceRequestItem[]> {
  const rows = await fetchAll<ServiceRequestRow>((from, to) =>
    supabase
      .from("service_request")
      .select(REQUEST_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return withNames(supabase, rows);
}

export interface ServiceRequestEvent {
  id: string;
  fromStatus: ServiceRequestRow["status"] | null;
  toStatus: ServiceRequestRow["status"];
  actorRole: string;
  note: string | null;
  createdAt: string;
}

export interface ProofPhoto {
  assetId: string;
  phase: "before" | "after";
  url: string | null;
  contentHash: string;
  // The day the photo stands for: the job day for photos of the job, the
  // visit day for a photo chosen from a published visit.
  day: string | null;
  fromVisit: boolean;
}

export interface ServiceRequestDetail {
  request: ServiceRequestItem;
  events: ServiceRequestEvent[];
  photos: ProofPhoto[];
}

export async function getServiceRequest(
  supabase: Client,
  id: string,
  signer: MediaSigner,
): Promise<ServiceRequestDetail | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase
    .from("service_request")
    .select(REQUEST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [[request], events, links] = await Promise.all([
    withNames(supabase, [data]),
    supabase
      .from("service_request_event")
      .select("id, from_status, to_status, actor_role, note, created_at")
      .eq("request_id", id)
      .order("created_at")
      .order("id"),
    supabase
      .from("service_request_photo")
      .select("asset_id, phase, created_at")
      .eq("request_id", id)
      .order("created_at")
      .order("id"),
  ]);
  if (events.error) throw events.error;
  if (links.error) throw links.error;

  // The assets are readable only once the job is done
  // (asset_service_proof_select); before that the list stays empty.
  const assetIds = [...new Set((links.data ?? []).map((l) => l.asset_id))];
  const assets =
    assetIds.length === 0 || request.status !== "done"
      ? []
      : await (async () => {
          const res = await supabase
            .from("asset")
            .select("id, uri, content_hash, session_id, produced_at")
            .in("id", assetIds);
          if (res.error) throw res.error;
          return res.data ?? [];
        })();
  const visitIds = [
    ...new Set(assets.filter((a) => a.session_id !== request.session_id).map((a) => a.session_id)),
  ];
  const visits =
    visitIds.length === 0
      ? []
      : await (async () => {
          const res = await supabase
            .from("session")
            .select("id, started_at, planned_date")
            .in("id", visitIds);
          if (res.error) throw res.error;
          return res.data ?? [];
        })();
  const visitDay = new Map(visits.map((v) => [v.id, v.started_at ?? v.planned_date]));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const urls = await signer.signUrls(assets.map((a) => a.uri));

  const photos: ProofPhoto[] = [];
  for (const link of links.data ?? []) {
    const asset = assetById.get(link.asset_id);
    if (!asset || (link.phase !== "before" && link.phase !== "after")) continue;
    const ofJob = asset.session_id === request.session_id;
    photos.push({
      assetId: asset.id,
      phase: link.phase,
      url: urls.get(asset.uri) ?? null,
      contentHash: asset.content_hash,
      day: ofJob
        ? (request.completed_on ?? asset.produced_at)
        : (visitDay.get(asset.session_id) ?? asset.produced_at),
      fromVisit: !ofJob,
    });
  }
  return {
    request,
    events: (events.data ?? []).map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      actorRole: e.actor_role,
      note: e.note,
      createdAt: e.created_at,
    })),
    photos,
  };
}

// Days of orchadOS mowing jobs on the parcel in the window before a visit
// (independence note; see independence.ts for the rule).
export async function loadOwnWork(
  supabase: Client,
  parcelId: string,
  visitTime: string,
): Promise<string[]> {
  const range = ownWorkQueryRange(visitTime);
  const { data, error } = await supabase
    .from("operation")
    .select("kind, started_at, details")
    .eq("parcel_id", parcelId)
    .in("kind", [...OWN_WORK_KINDS])
    .gte("started_at", range.from)
    .lt("started_at", range.to)
    .order("started_at");
  if (error) throw error;
  return ownWorkDays(data ?? [], visitTime);
}
