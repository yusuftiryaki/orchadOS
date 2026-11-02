import type { Database } from "@/lib/database.types";
import type { Client } from "@/lib/supabase/types";
import type { QueueFilters } from "./services";

// Reads of the service layer's back office (IP15) as the signed-in ops user:
// the queue and demand functions (ops of the org only), the request row
// (owner-visible columns; the internal note comes from the queue function),
// its history and proof photos, the catalogue and the robot notes.

type Fns = Database["public"]["Functions"];
export type ServiceQueueRow = Fns["ops_service_requests"]["Returns"][number];
export type ServiceDemandRow = Fns["ops_service_demand"]["Returns"][number];
export type ServiceTypeRow = Database["public"]["Tables"]["service_type"]["Row"];
export type ServiceEventRow = Database["public"]["Tables"]["service_request_event"]["Row"];
export type RobotNoteRow = Database["public"]["Tables"]["parcel_robot_note"]["Row"];

export async function listServiceRequests(
  supabase: Client,
  filters: Partial<QueueFilters> = {},
): Promise<ServiceQueueRow[]> {
  const { data, error } = await supabase.rpc("ops_service_requests", {
    ...(filters.status ? { p_status: filters.status } : {}),
    ...(filters.serviceTypeId ? { p_service_type_id: filters.serviceTypeId } : {}),
    ...(filters.seasonYear ? { p_season_year: filters.seasonYear } : {}),
  });
  if (error) throw error;
  return data ?? [];
}

export async function serviceDemand(supabase: Client): Promise<ServiceDemandRow[]> {
  const { data, error } = await supabase.rpc("ops_service_demand");
  if (error) throw error;
  return data ?? [];
}

export async function listServiceTypes(
  supabase: Client,
  orgIds: string[],
): Promise<ServiceTypeRow[]> {
  if (orgIds.length === 0) return [];
  const { data, error } = await supabase
    .from("service_type")
    .select("*")
    .in("org_id", orgIds)
    .order("sort_order")
    .order("code");
  if (error) throw error;
  return data ?? [];
}

const REQUEST_COLUMNS =
  "id, org_id, parcel_id, service_type_id, number, status, season_year, preferred_window, customer_note, terms_version, early_performance_requested, recommended_weed_height, area_m2, area_source, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp, price_is_draft, estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus, pricing_rule, quote_total_kurus, scheduled_date, session_id, operation_id, completed_on, cancelled_at, cancelled_by_role, cancel_reason, payment_received_on, payment_amount_kurus, payment_method, created_at";

export interface ServicePhoto {
  assetId: string;
  phase: "before" | "after";
  kind: string;
  uri: string;
  linkedAt: string;
  // On the job's own session (uploaded), else from a published visit.
  uploaded: boolean;
}

export interface LinkableAsset {
  id: string;
  kind: string;
  uri: string;
}

export interface ServiceRequestView {
  request: NonNullable<Awaited<ReturnType<typeof readRequest>>>;
  // The queue row: parcel, requester contact, internal note, photo counts.
  row: ServiceQueueRow;
  events: ServiceEventRow[];
  photos: ServicePhoto[];
}

async function readRequest(supabase: Client, id: string) {
  const { data, error } = await supabase
    .from("service_request")
    .select(REQUEST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// One request for ops, or null (not found or not ops of its org). The queue
// function is the only read of the internal note and the requester's
// contact; it has no id filter, so the request's status narrows it.
export async function getServiceRequest(
  supabase: Client,
  id: string,
): Promise<ServiceRequestView | null> {
  const request = await readRequest(supabase, id);
  if (!request) return null;
  const [rows, events, photos] = await Promise.all([
    listServiceRequests(supabase, {
      status: request.status,
      serviceTypeId: request.service_type_id,
      seasonYear: request.season_year,
    }),
    supabase
      .from("service_request_event")
      .select("*")
      .eq("request_id", id)
      .order("created_at")
      .order("id"),
    listPhotos(supabase, id, request.session_id),
  ]);
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  if (events.error) throw events.error;
  return { request, row, events: events.data ?? [], photos };
}

async function listPhotos(
  supabase: Client,
  requestId: string,
  sessionId: string | null,
): Promise<ServicePhoto[]> {
  const { data: links, error } = await supabase
    .from("service_request_photo")
    .select("asset_id, phase, created_at")
    .eq("request_id", requestId)
    .order("created_at");
  if (error) throw error;
  if (!links || links.length === 0) return [];
  const { data: assets, error: assetError } = await supabase
    .from("asset")
    .select("id, kind, uri, session_id")
    .in(
      "id",
      links.map((l) => l.asset_id),
    );
  if (assetError) throw assetError;
  const byId = new Map((assets ?? []).map((a) => [a.id, a]));
  return links.map((l) => {
    const a = byId.get(l.asset_id);
    return {
      assetId: l.asset_id,
      phase: l.phase as ServicePhoto["phase"],
      kind: a?.kind ?? "photo",
      uri: a?.uri ?? "",
      linkedAt: l.created_at,
      uploaded: !!a && a.session_id === sessionId,
    };
  });
}

// Photos and tree crops of the parcel's latest published visit, to link as
// proof (ops_link_service_photo accepts these). A handful is enough to pick
// from; the uploaded photos of the job are the usual proof.
export async function linkableVisitAssets(
  supabase: Client,
  parcelId: string,
  limit = 24,
): Promise<{ visitDay: string | null; assets: LinkableAsset[] }> {
  const { data: session, error } = await supabase
    .from("session")
    .select("id, published_at, started_at, planned_date")
    .eq("parcel_id", parcelId)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!session) return { visitDay: null, assets: [] };
  const { data: assets, error: assetError } = await supabase
    .from("asset")
    .select("id, kind, uri")
    .eq("session_id", session.id)
    .in("kind", ["photo", "tree_crop"])
    .order("produced_at", { ascending: false })
    .order("id")
    .limit(limit);
  if (assetError) throw assetError;
  return {
    visitDay: session.started_at ?? session.planned_date ?? session.published_at,
    assets: assets ?? [],
  };
}

export async function getRobotNote(
  supabase: Client,
  parcelId: string,
): Promise<RobotNoteRow | null> {
  const { data, error } = await supabase
    .from("parcel_robot_note")
    .select("*")
    .eq("parcel_id", parcelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// The parcel's requests for its page (owner-visible columns).
export async function parcelServiceRequests(supabase: Client, parcelId: string) {
  const { data, error } = await supabase
    .from("service_request")
    .select(
      "id, number, status, scheduled_date, completed_on, estimate_total_kurus, quote_total_kurus, service_type(name), created_at",
    )
    .eq("parcel_id", parcelId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}
