import type { Database } from "@/lib/database.types";
import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import { boundaryProblem, nextBoundaryVersion, ringToEwkt, type BoundaryProblem } from "./boundary";
import type { LatLon } from "./local-frame";
import { INFRASTRUCTURE_KINDS, LINE_ZONE_KINDS, POINT_ZONE_KINDS } from "./inventory-workspace";
import { VERIFICATION_REASONS, type VerificationReason } from "./verification-candidates";

// Writes of the inventory workspace (office) and the approval screen
// (expert), as the signed-in user. Row level security and the database
// functions decide who may write; nothing here uses a service key. Input
// arrives from the browser and is checked first.

type Enums = Database["public"]["Enums"];

export type EditError =
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "frozen"
  | "item_closed"
  | "item_not_open"
  | BoundaryProblem
  | "write_failed";

export type EditResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: EditError; detail?: string };

const MAX_ITEMS = 5000;
const MAX_NOTE = 2000;
const MAX_VERTICES = 500;

const fail = (
  error: EditError,
  detail?: string,
): { ok: false; error: EditError; detail?: string } =>
  detail ? { ok: false, error, detail } : { ok: false, error };

// Database errors: row level security (42501), the functions' reasons as the
// message, the frozen-coding trigger (P0001).
function dbError(error: { message: string; code?: string; details?: string | null }) {
  const known: EditError[] = [
    "invalid_input",
    "not_found",
    "forbidden",
    "item_closed",
    "item_not_open",
  ];
  if (known.includes(error.message as EditError)) {
    return fail(error.message as EditError, error.details ?? undefined);
  }
  if (error.code === "42501") return fail("forbidden");
  if (/inventory .*is approved/.test(error.message)) return fail("frozen", error.message);
  return fail("write_failed", error.message);
}

function note(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > MAX_NOTE) return undefined;
  return value.trim() === "" ? null : value.trim();
}

function latLonList(raw: unknown, max: number): LatLon[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: LatLon[] = [];
  for (const p of raw as Record<string, unknown>[]) {
    if (
      !p ||
      typeof p.lat !== "number" ||
      typeof p.lon !== "number" ||
      !(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
    ) {
      return null;
    }
    out.push({ lat: p.lat, lon: p.lon });
  }
  return out;
}

async function orgOf(supabase: Client, parcelId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("parcel")
    .select("org_id")
    .eq("id", parcelId)
    .maybeSingle();
  if (error) throw error;
  return data?.org_id ?? null;
}

// ---------------------------------------------------------------------------
// Tree attributes (office: first assessment; expert: corrections)
// ---------------------------------------------------------------------------

export interface TreeAttributes {
  ageClass?: Enums["age_class"];
  graft?: Enums["graft_status"];
  stemForm?: Enums["stem_form"];
  sex?: Enums["tree_sex"];
}

const AGE: Enums["age_class"][] = ["sapling", "young", "productive", "old", "unknown"];
const GRAFT: Enums["graft_status"][] = ["grafted", "ungrafted", "unknown"];
const SEX: Enums["tree_sex"][] = ["female", "male", "unknown"];
const STEM: Enums["stem_form"][] = ["single", "multi", "unknown"];

export async function setTreeAttributes(
  supabase: Client,
  raw: unknown,
): Promise<EditResult<{ updated: number }>> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ids = r.treeIds;
  const attrs = (r.attributes ?? {}) as Record<string, unknown>;
  const patch: Database["public"]["Tables"]["tree"]["Update"] = {};
  if (attrs.ageClass !== undefined) {
    if (!AGE.includes(attrs.ageClass as Enums["age_class"])) return fail("invalid_input");
    patch.age_class = attrs.ageClass as Enums["age_class"];
  }
  if (attrs.graft !== undefined) {
    if (!GRAFT.includes(attrs.graft as Enums["graft_status"])) return fail("invalid_input");
    patch.graft = attrs.graft as Enums["graft_status"];
  }
  if (attrs.stemForm !== undefined) {
    if (!STEM.includes(attrs.stemForm as Enums["stem_form"])) return fail("invalid_input");
    patch.stem_form = attrs.stemForm as Enums["stem_form"];
  }
  if (attrs.sex !== undefined) {
    if (!SEX.includes(attrs.sex as Enums["tree_sex"])) return fail("invalid_input");
    patch.sex = attrs.sex as Enums["tree_sex"];
  }
  if (
    !isUuid(r.parcelId) ||
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_ITEMS ||
    !ids.every(isUuid) ||
    Object.keys(patch).length === 0
  ) {
    return fail("invalid_input");
  }
  let updated = 0;
  // Keeps the URL of the filter short for large selections.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("tree")
      .update(patch)
      .eq("parcel_id", r.parcelId)
      .eq("status", "active")
      .in("id", ids.slice(i, i + 200))
      .select("id");
    if (error) return dbError(error);
    updated += data.length;
  }
  // Row level security hides the rows from roles that may not write them.
  if (updated === 0) return fail("forbidden");
  return { ok: true, updated };
}

// ---------------------------------------------------------------------------
// Infrastructure (zone)
// ---------------------------------------------------------------------------

export async function addZone(supabase: Client, raw: unknown): Promise<EditResult<{ id: string }>> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = r.kind as Enums["zone_kind"];
  const points = latLonList(r.points, MAX_VERTICES);
  const name = note(r.name);
  if (
    !isUuid(r.parcelId) ||
    !INFRASTRUCTURE_KINDS.includes(kind) ||
    !points ||
    name === undefined
  ) {
    return fail("invalid_input");
  }
  let geom: string;
  if (POINT_ZONE_KINDS.includes(kind)) {
    if (points.length !== 1) return fail("invalid_input");
    geom = `SRID=4326;POINT(${points[0].lon} ${points[0].lat})`;
  } else if (LINE_ZONE_KINDS.includes(kind)) {
    if (points.length < 2) return fail("invalid_input");
    geom = `SRID=4326;LINESTRING(${points.map((p) => `${p.lon} ${p.lat}`).join(", ")})`;
  } else {
    return fail("invalid_input");
  }
  const orgId = await orgOf(supabase, r.parcelId);
  if (!orgId) return fail("not_found");
  const { data, error } = await supabase
    .from("zone")
    .insert({
      org_id: orgId,
      parcel_id: r.parcelId,
      kind,
      name,
      geom,
      position_uncertainty_m: typeof r.uncertaintyM === "number" ? r.uncertaintyM : 1,
    })
    .select("id")
    .single();
  if (error) return dbError(error);
  return { ok: true, id: data.id };
}

export async function deleteZone(supabase: Client, raw: unknown): Promise<EditResult> {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!isUuid(r.parcelId) || !isUuid(r.zoneId)) return fail("invalid_input");
  const { data, error } = await supabase
    .from("zone")
    .delete()
    .eq("id", r.zoneId)
    .eq("parcel_id", r.parcelId)
    .select("id");
  if (error) return dbError(error);
  // Only ops may delete (row level security): nothing deleted otherwise.
  if (data.length === 0) return fail("forbidden");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Boundary drawn in the office: a new field_survey version
// ---------------------------------------------------------------------------

export async function saveBoundary(
  supabase: Client,
  raw: unknown,
): Promise<EditResult<{ version: number }>> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ring = latLonList(r.ring, MAX_VERTICES);
  const uncertainty = r.vertexUncertaintyM;
  const sessionId = r.sessionId ?? null;
  if (
    !isUuid(r.parcelId) ||
    !ring ||
    typeof uncertainty !== "number" ||
    !(uncertainty >= 0 && uncertainty <= 100) ||
    (sessionId !== null && !isUuid(sessionId))
  ) {
    return fail("invalid_input");
  }
  const problem = boundaryProblem(ring);
  if (problem) return fail(problem);
  const orgId = await orgOf(supabase, r.parcelId);
  if (!orgId) return fail("not_found");

  let surveyedAt: string | null = null;
  if (sessionId) {
    const { data } = await supabase
      .from("session")
      .select("started_at")
      .eq("id", sessionId)
      .eq("parcel_id", r.parcelId)
      .maybeSingle();
    if (!data) return fail("invalid_input", "session");
    surveyedAt = data.started_at;
  }

  // Two saves at once: the second one hits unique (parcel_id, version) and retries.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: versions, error: readError } = await supabase
      .from("boundary")
      .select("version")
      .eq("parcel_id", r.parcelId);
    if (readError) return dbError(readError);
    const version = nextBoundaryVersion(versions.map((v) => v.version));
    const { error } = await supabase.from("boundary").insert({
      org_id: orgId,
      parcel_id: r.parcelId,
      version,
      geom: ringToEwkt(ring),
      source: "field_survey",
      vertex_uncertainty_m: uncertainty,
      session_id: sessionId,
      surveyed_at: surveyedAt,
    });
    if (!error) return { ok: true, version };
    if (error.code !== "23505") return dbError(error);
  }
  return fail("write_failed", "boundary version taken");
}

// ---------------------------------------------------------------------------
// Verification tour and items (create_verification_tour & co.)
// ---------------------------------------------------------------------------

export interface TourItemInput {
  slotId: string;
  reasons: VerificationReason[];
  note: string | null;
}

export async function createVerificationTour(
  supabase: Client,
  raw: unknown,
): Promise<EditResult<{ sessionId: string; items: number }>> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const plannedDate = r.plannedDate ?? null;
  if (
    !isUuid(r.parcelId) ||
    !Array.isArray(r.items) ||
    r.items.length === 0 ||
    r.items.length > MAX_ITEMS ||
    (plannedDate !== null &&
      !(typeof plannedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(plannedDate)))
  ) {
    return fail("invalid_input");
  }
  const items: { slot_id: string; reasons: VerificationReason[]; note: string | null }[] = [];
  for (const item of r.items as Record<string, unknown>[]) {
    const reasons = item?.reasons;
    const n = note(item?.note);
    if (
      !item ||
      !isUuid(item.slotId) ||
      !Array.isArray(reasons) ||
      reasons.length === 0 ||
      !reasons.every((x) => VERIFICATION_REASONS.includes(x as VerificationReason)) ||
      n === undefined
    ) {
      return fail("invalid_input");
    }
    items.push({ slot_id: item.slotId, reasons: reasons as VerificationReason[], note: n });
  }
  const { data, error } = await supabase.rpc("create_verification_tour", {
    p_parcel_id: r.parcelId,
    p_items:
      items as unknown as Database["public"]["Functions"]["create_verification_tour"]["Args"]["p_items"],
    p_planned_date: (plannedDate as string | null) ?? undefined,
  });
  if (error) return dbError(error);
  const result = data as { session_id: string; items: number };
  return { ok: true, sessionId: result.session_id, items: result.items };
}

export async function recordVerificationResult(
  supabase: Client,
  raw: unknown,
): Promise<EditResult> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = note(r.note);
  if (!isUuid(r.itemId) || typeof r.treePresent !== "boolean" || n === undefined) {
    return fail("invalid_input");
  }
  const { error } = await supabase.rpc("record_verification_result", {
    p_item_id: r.itemId,
    p_tree_present: r.treePresent,
    p_note: n ?? undefined,
  });
  if (error) return dbError(error);
  return { ok: true };
}

export async function closeVerificationItem(supabase: Client, raw: unknown): Promise<EditResult> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = note(r.note);
  if (!isUuid(r.itemId) || !n) return fail("invalid_input");
  const { error } = await supabase.rpc("close_verification_item", {
    p_item_id: r.itemId,
    p_note: n,
  });
  if (error) return dbError(error);
  return { ok: true };
}
