import type { Database } from "@/lib/database.types";
import type { CheckSlot } from "@/lib/expert/inventory-checks";
import { isPoint, isPolygon } from "@/lib/map/geo";
import { fetchAll, UUID_RE } from "@/lib/supabase/query";
import { loadFruitSpecies, type FruitSpecies } from "@/lib/species";
import type { Client } from "@/lib/supabase/types";
import type { LatLon } from "./local-frame";
import type { CandidateSlot, VerificationReason } from "./verification-candidates";

// A parcel's saved inventory as the office workspace, the expert's approval
// screen and the owner's boundary card read it: slots with their active
// trees, boundary versions, infrastructure (zone), verification tours and the
// inventory session. Every query runs as the signed-in user; row level
// security decides what is visible (verification items: org roles only).

type Enums = Database["public"]["Enums"];

export interface WorkspaceTree {
  id: string;
  sex: Enums["tree_sex"];
  graft: Enums["graft_status"];
  ageClass: Enums["age_class"];
  stemForm: Enums["stem_form"];
  cultivar: string | null;
  // Fruit species override (mixed orchards); null or absent: the parcel's.
  species?: string | null;
}

export interface WorkspaceSlot extends CheckSlot, Omit<CandidateSlot, "treeId" | "position"> {
  uncertaintyM: number | null;
  tree: WorkspaceTree | null;
}

export interface WorkspaceBoundary {
  id: string;
  version: number;
  ring: LatLon[];
  source: Enums["boundary_source"];
  areaM2: number | null;
  vertexUncertaintyM: number | null;
  ownerApprovedAt: string | null;
  ownerApprovedBy: string | null;
  createdAt: string;
}

export type ZoneGeometry = GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon;

export interface WorkspaceZone {
  id: string;
  kind: Enums["zone_kind"];
  name: string | null;
  geometry: ZoneGeometry;
}

export interface WorkspaceItem {
  id: string;
  sessionId: string;
  slotId: string;
  code: string;
  treeId: string | null;
  reasons: VerificationReason[];
  note: string | null;
  status: Enums["verification_status"];
  treePresent: boolean | null;
  resultNote: string | null;
  checkedAt: string | null;
  closeupCaptureId: string | null;
}

export interface WorkspaceTour {
  id: string;
  status: Enums["session_status"];
  plannedDate: string | null;
  createdAt: string;
  items: WorkspaceItem[];
}

export interface WorkspaceSession {
  id: string;
  status: Enums["session_status"];
  plannedDate: string | null;
  startedAt: string | null;
  createdAt: string;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface InventoryWorkspace {
  parcel: {
    id: string;
    orgId: string;
    name: string;
    status: Enums["parcel_status"];
    // Main fruit species (lib/species.ts).
    species: string;
  };
  // public.fruit_species for the tree species override, in display order.
  speciesOptions: FruitSpecies[];
  // The approved inventory session if there is one, else the newest open one.
  inventorySession: WorkspaceSession | null;
  approved: boolean;
  slots: WorkspaceSlot[];
  // Newest first.
  boundaries: WorkspaceBoundary[];
  zones: WorkspaceZone[];
  // Newest first; empty for owners and viewers (row level security).
  tours: WorkspaceTour[];
}

// Tabs of the office workspace (/ofis/parsel/<parcel>/envanter/duzenle?sekme=).
export type WorkspaceTab = "attributes" | "infrastructure" | "boundary" | "verification";
export const WORKSPACE_TABS: WorkspaceTab[] = [
  "attributes",
  "infrastructure",
  "boundary",
  "verification",
];

export const POINT_ZONE_KINDS: Enums["zone_kind"][] = ["well", "pool", "gate", "shed"];
export const LINE_ZONE_KINDS: Enums["zone_kind"][] = ["irrigation_line", "fence"];
export const INFRASTRUCTURE_KINDS: Enums["zone_kind"][] = [...POINT_ZONE_KINDS, ...LINE_ZONE_KINDS];

function latLon(c: number[]): LatLon {
  return { lat: c[1], lon: c[0] };
}

// Session time as everywhere else: start, else planned day, else creation.
function sessionTime(s: {
  started_at: string | null;
  planned_date: string | null;
  created_at: string;
}) {
  return Date.parse(
    s.started_at ?? (s.planned_date ? `${s.planned_date}T00:00:00Z` : s.created_at),
  );
}

const SLOT_COLUMNS =
  "id, code, row_no, position_no, suffix, kind, position::json, position_uncertainty_m, tree(id, sex, graft, age_class, stem_form, cultivar, status, species)";

// Null when the parcel does not exist or the user may not see it.
export async function loadInventoryWorkspace(
  supabase: Client,
  parcelId: string,
): Promise<InventoryWorkspace | null> {
  if (!UUID_RE.test(parcelId)) return null;
  const { data: parcel, error } = await supabase
    .from("parcel")
    .select("id, org_id, name, status, species")
    .eq("id", parcelId)
    .maybeSingle();
  if (error) throw error;
  if (!parcel) return null;

  const [slotRows, boundaries, zones, sessions, items, unsure, speciesOptions] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("slot")
        .select(SLOT_COLUMNS)
        .eq("parcel_id", parcelId)
        .order("row_no")
        .order("position_no")
        .order("code")
        .range(from, to),
    ),
    supabase
      .from("boundary")
      .select(
        "id, version, geom::json, source, area_m2, vertex_uncertainty_m, owner_approved_at, owner_approved_by, created_at",
      )
      .eq("parcel_id", parcelId)
      .order("version", { ascending: false }),
    fetchAll((from, to) =>
      supabase
        .from("zone")
        .select("id, kind, name, geom::json")
        .eq("parcel_id", parcelId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("session")
      .select("id, kind, status, planned_date, started_at, created_at, published_at, published_by")
      .eq("parcel_id", parcelId)
      .in("kind", ["inventory", "verification"])
      .neq("status", "cancelled"),
    fetchAll((from, to) =>
      supabase
        .from("verification_item")
        .select(
          "id, session_id, slot_id, tree_id, reasons, note, status, tree_present, result_note, checked_at, closeup_capture_id, created_at",
        )
        .eq("parcel_id", parcelId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    // Trees the office marked "not sure" (org roles only; empty for owners).
    fetchAll((from, to) =>
      supabase
        .from("trunk_label")
        .select("id, tree_id")
        .eq("parcel_id", parcelId)
        .eq("unsure", true)
        .order("id")
        .range(from, to),
    ),
    loadFruitSpecies(supabase),
  ]);
  for (const r of [boundaries, sessions]) if (r.error) throw r.error;

  const unsureTrees = new Set(unsure.map((l) => l.tree_id));
  const slots: WorkspaceSlot[] = slotRows.map((s) => {
    const tree = (s.tree ?? []).find((t) => t.status === "active");
    return {
      id: s.id,
      // Generated column: never null in practice.
      code: s.code ?? "",
      rowNo: s.row_no,
      positionNo: s.position_no,
      suffix: s.suffix,
      kind: s.kind,
      position: isPoint(s.position) ? latLon(s.position.coordinates) : null,
      uncertaintyM: s.position_uncertainty_m,
      unsure: tree ? unsureTrees.has(tree.id) : false,
      tree: tree
        ? {
            id: tree.id,
            sex: tree.sex,
            graft: tree.graft,
            ageClass: tree.age_class,
            stemForm: tree.stem_form,
            cultivar: tree.cultivar,
            species: tree.species,
          }
        : null,
    };
  });
  const codeOf = new Map(slots.map((s) => [s.id, s.code]));

  const all = sessions.data ?? [];
  const inventory = all
    .filter((s) => s.kind === "inventory")
    .sort(
      (a, b) =>
        Number(b.status === "published") - Number(a.status === "published") ||
        sessionTime(b) - sessionTime(a) ||
        b.created_at.localeCompare(a.created_at),
    )[0];

  const itemsBySession = new Map<string, WorkspaceItem[]>();
  for (const i of items) {
    const item: WorkspaceItem = {
      id: i.id,
      sessionId: i.session_id,
      slotId: i.slot_id,
      code: codeOf.get(i.slot_id) ?? "",
      treeId: i.tree_id,
      reasons: i.reasons,
      note: i.note,
      status: i.status,
      treePresent: i.tree_present,
      resultNote: i.result_note,
      checkedAt: i.checked_at,
      closeupCaptureId: i.closeup_capture_id,
    };
    itemsBySession.set(i.session_id, [...(itemsBySession.get(i.session_id) ?? []), item]);
  }
  const slotOrder = new Map(slots.map((s, i) => [s.id, i]));
  const tours: WorkspaceTour[] = all
    .filter((s) => s.kind === "verification" && itemsBySession.has(s.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((s) => ({
      id: s.id,
      status: s.status,
      plannedDate: s.planned_date,
      createdAt: s.created_at,
      items: itemsBySession
        .get(s.id)!
        .sort((a, b) => (slotOrder.get(a.slotId) ?? 0) - (slotOrder.get(b.slotId) ?? 0)),
    }));

  return {
    parcel: {
      id: parcel.id,
      orgId: parcel.org_id,
      name: parcel.name,
      status: parcel.status,
      species: parcel.species,
    },
    speciesOptions,
    inventorySession: inventory
      ? {
          id: inventory.id,
          status: inventory.status,
          plannedDate: inventory.planned_date,
          startedAt: inventory.started_at,
          createdAt: inventory.created_at,
          publishedAt: inventory.published_at,
          publishedBy: inventory.published_by,
        }
      : null,
    approved: inventory?.status === "published",
    slots,
    boundaries: (boundaries.data ?? []).flatMap((b) =>
      isPolygon(b.geom)
        ? [
            {
              id: b.id,
              version: b.version,
              ring: b.geom.coordinates[0].map(latLon),
              source: b.source,
              areaM2: b.area_m2,
              vertexUncertaintyM: b.vertex_uncertainty_m,
              ownerApprovedAt: b.owner_approved_at,
              ownerApprovedBy: b.owner_approved_by,
              createdAt: b.created_at,
            },
          ]
        : [],
    ),
    zones: zones.flatMap((z) => {
      const g = z.geom as GeoJSON.Geometry | null;
      return g && (g.type === "Point" || g.type === "LineString" || g.type === "Polygon")
        ? [{ id: z.id, kind: z.kind, name: z.name, geometry: g }]
        : [];
    }),
    tours,
  };
}

// Slots with an open item: they are not offered for a new tour.
export function slotsWithOpenItems(tours: WorkspaceTour[]): Set<string> {
  return new Set(
    tours.flatMap((t) => t.items.filter((i) => i.status === "open").map((i) => i.slotId)),
  );
}
