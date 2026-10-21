import type { Database } from "@/lib/database.types";
import { isPoint, isPolygon, type Position } from "@/lib/map/geo";
import { fetchAll, isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import { VISIT_KINDS, type SessionStatus, type VisitKind, type VisitRow } from "./visits";

// Reads of the operations screens, as the signed-in user. Private data comes
// only from the ops_* functions, which return rows for ops of the org and
// nothing for anyone else.

type Functions = Database["public"]["Functions"];
export type OwnerProfile = Functions["ops_owner_profiles"]["Returns"][number];
export type ParcelDetail = Functions["ops_parcel_detail"]["Returns"][number];
export type ParcelAccessRow = Functions["ops_parcel_access"]["Returns"][number];
export type ParcelRow = Database["public"]["Tables"]["parcel"]["Row"];

export interface OpsOrg {
  id: string;
  name: string;
}

// Orgs where the user is ops: the forms write into one of these.
export async function opsOrgs(supabase: Client, userId: string): Promise<OpsOrg[]> {
  const { data, error } = await supabase
    .from("membership")
    .select("org_id, org(name)")
    .eq("user_id", userId)
    .eq("role", "ops");
  if (error) throw error;
  return data
    .map((m) => ({ id: m.org_id, name: m.org?.name ?? m.org_id }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export interface Visit extends VisitRow {
  org_id: string;
  parcel_id: string;
  parcel_name: string;
  lead_user_id: string | null;
  notes: string | null;
  methodology_version: string | null;
}

export interface VisitFilters {
  parcelId?: string | null;
  leadUserId?: string | null;
  status?: SessionStatus | null;
  kind?: VisitKind | null;
}

const VISIT_COLUMNS =
  "id, org_id, parcel_id, kind, status, planned_date, started_at, ended_at, created_at, lead_user_id, notes, methodology_version, parcel(name)";

type VisitSelect = Omit<Visit, "parcel_name"> & { parcel: { name: string } | null };

const toVisit = ({ parcel, ...row }: VisitSelect): Visit => ({
  ...row,
  parcel_name: parcel?.name ?? "",
});

// Visits (inventory, periodic scan, verification) the user can read, newest
// planned day first.
export async function listVisits(supabase: Client, filters: VisitFilters = {}): Promise<Visit[]> {
  const rows = await fetchAll((from, to) => {
    let q = supabase
      .from("session")
      .select(VISIT_COLUMNS)
      .in("kind", [...VISIT_KINDS]);
    if (filters.parcelId && isUuid(filters.parcelId)) q = q.eq("parcel_id", filters.parcelId);
    if (filters.leadUserId && isUuid(filters.leadUserId))
      q = q.eq("lead_user_id", filters.leadUserId);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.kind) q = q.eq("kind", filters.kind);
    return q
      .order("planned_date", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, to);
  });
  return (rows as unknown as VisitSelect[]).map(toVisit);
}

export async function getVisit(supabase: Client, id: string): Promise<Visit | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase
    .from("session")
    .select(VISIT_COLUMNS)
    .eq("id", id)
    .in("kind", [...VISIT_KINDS])
    .maybeSingle();
  if (error) throw error;
  return data ? toVisit(data as unknown as VisitSelect) : null;
}

export interface Member {
  userId: string;
  email: string;
  roles: Database["public"]["Enums"]["org_role"][];
}

export async function listMembers(supabase: Client, orgId: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc("ops_org_members", { p_org_id: orgId });
  if (error) throw error;
  const byUser = new Map<string, Member>();
  for (const row of data) {
    const m = byUser.get(row.user_id) ?? { userId: row.user_id, email: row.email, roles: [] };
    m.roles.push(row.role);
    byUser.set(row.user_id, m);
  }
  return [...byUser.values()];
}

// Field staff of every ops org of the user (leads of visits).
export async function listFieldStaff(supabase: Client, orgs: OpsOrg[]) {
  const lists = await Promise.all(orgs.map((o) => listMembers(supabase, o.id)));
  return lists.flat().filter((m) => m.roles.includes("field_staff"));
}

// Field staff of the user's ops orgs, with the orgs each one works for (the
// lead of a visit must be field staff of the visit's org).
export async function listStaffByUser(supabase: Client, orgs: OpsOrg[]) {
  const byUser = new Map<string, { userId: string; email: string; orgIds: string[] }>();
  const lists = await Promise.all(orgs.map((o) => listMembers(supabase, o.id)));
  orgs.forEach((org, i) => {
    for (const m of lists[i]) {
      if (!m.roles.includes("field_staff")) continue;
      const entry = byUser.get(m.userId) ?? { userId: m.userId, email: m.email, orgIds: [] };
      entry.orgIds.push(org.id);
      byUser.set(m.userId, entry);
    }
  });
  return [...byUser.values()];
}

export async function listOwnerProfiles(supabase: Client): Promise<OwnerProfile[]> {
  const { data, error } = await supabase.rpc("ops_owner_profiles", {});
  if (error) throw error;
  return data;
}

export async function getOwnerProfile(supabase: Client, id: string): Promise<OwnerProfile | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.rpc("ops_owner_profiles", { p_profile_id: id });
  if (error) throw error;
  return data[0] ?? null;
}

export interface AccessOfUser {
  parcelId: string;
  parcelName: string;
  role: Database["public"]["Enums"]["parcel_role"];
}

// Parcels an account has portal access to (ops reads parcel_access of its org).
export async function accessOfUser(supabase: Client, userId: string): Promise<AccessOfUser[]> {
  const { data, error } = await supabase
    .from("parcel_access")
    .select("parcel_id, role, parcel(name)")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data.map((r) => ({
    parcelId: r.parcel_id,
    parcelName: r.parcel?.name ?? "",
    role: r.role,
  }));
}

export interface ParcelOps {
  parcel: ParcelRow & { position: Position | null };
  detail: ParcelDetail | null;
  access: ParcelAccessRow[];
  boundary: { version: number; source: string; ring: Position[]; createdAt: string } | null;
  boundaryCount: number;
}

// Everything the parcel pages of /operasyon show. Null when not visible.
export async function getParcelOps(supabase: Client, parcelId: string): Promise<ParcelOps | null> {
  if (!isUuid(parcelId)) return null;
  const { data: parcel, error } = await supabase
    .from("parcel")
    .select("*, position::json")
    .eq("id", parcelId)
    .maybeSingle();
  if (error) throw error;
  if (!parcel) return null;

  const [detail, access, boundaries] = await Promise.all([
    supabase.rpc("ops_parcel_detail", { p_parcel_id: parcelId }),
    supabase.rpc("ops_parcel_access", { p_parcel_id: parcelId }),
    supabase
      .from("boundary")
      .select("version, source, created_at, geom::json")
      .eq("parcel_id", parcelId)
      .order("version", { ascending: false }),
  ]);
  if (detail.error) throw detail.error;
  if (access.error) throw access.error;
  if (boundaries.error) throw boundaries.error;

  const latest = boundaries.data[0];
  const geom: unknown = latest?.geom;
  const ring = isPolygon(geom)
    ? geom.coordinates[0].slice(0, -1).map(([lon, lat]) => [lon, lat] as Position)
    : null;
  const position: unknown = parcel.position;

  return {
    parcel: {
      ...(parcel as unknown as ParcelRow),
      position: isPoint(position) ? [position.coordinates[0], position.coordinates[1]] : null,
    },
    detail: detail.data[0] ?? null,
    access: access.data,
    boundary:
      latest && ring
        ? { version: latest.version, source: latest.source, ring, createdAt: latest.created_at }
        : null,
    boundaryCount: boundaries.data.length,
  };
}

export interface ParcelOption {
  id: string;
  orgId: string;
  name: string;
  status: Database["public"]["Enums"]["parcel_status"];
}

export async function listParcelOptions(supabase: Client): Promise<ParcelOption[]> {
  const { data, error } = await supabase
    .from("parcel")
    .select("id, org_id, name, status")
    .order("name");
  if (error) throw error;
  return data.map((p) => ({ id: p.id, orgId: p.org_id, name: p.name, status: p.status }));
}
