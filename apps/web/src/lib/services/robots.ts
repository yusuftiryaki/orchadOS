import type { Database } from "@/lib/database.types";
import type { OfferEstimate } from "./offers";

// Robot models of the fleet as the portal shows them (IP15, docs/MVP.md
// Module 6; supabase/migrations/20261107100000_robot_fleet.sql): the badge,
// its card and the "Hangi robot yapsın?" choice of the request form. Pure;
// unit tested.

type RobotModelRow = Pick<
  Database["public"]["Tables"]["robot_model"]["Row"],
  "id" | "code" | "name" | "short_description" | "capabilities" | "image_path"
>;
type RobotOfferRow = Database["public"]["Functions"]["service_robot_offers"]["Returns"][number];

export interface RobotModel {
  id: string;
  code: string;
  name: string;
  shortDescription: string;
  capabilities: string[];
  // Public path of a representative image (apps/web/public), or null.
  imagePath: string | null;
  // The technical drawing (apps/web/public/robots), or null when there is none.
  drawingPath: string | null;
}

export interface RobotOffer {
  robot: RobotModel;
  isDefault: boolean;
  // This model's estimate, or null when the service is unpriced for it.
  estimate: OfferEstimate | null;
}

// The columns robotModelOf reads.
export const ROBOT_MODEL_COLUMNS = "id, code, name, short_description, capabilities, image_path";

// Technical drawings shipped with the portal, by model code. The database has
// no column for them yet (one model, one drawing).
const ROBOT_DRAWINGS: Record<string, string> = { maraba_i: "/robots/maraba-i.svg" };

// Only paths under /robots/ are drawn; anything else would be an image the
// portal does not ship.
function imagePathOf(value: string | null | undefined): string | null {
  return typeof value === "string" && /^\/robots\/[A-Za-z0-9_.-]+$/.test(value) ? value : null;
}

export function robotModelOf(
  row: Omit<RobotModelRow, "capabilities"> & { capabilities: string[] | null },
): RobotModel {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    shortDescription: row.short_description,
    capabilities: row.capabilities ?? [],
    imagePath: imagePathOf(row.image_path),
    drawingPath: ROBOT_DRAWINGS[row.code] ?? null,
  };
}

// Rows of public.service_robot_offers; the database leaves the price and the
// estimate null when unpriced (all or none), which the generated types do not
// say for set-returning functions.
export function robotOfferOf(row: RobotOfferRow): RobotOffer {
  const r = row as {
    [K in keyof RobotOfferRow]: RobotOfferRow[K] | null;
  };
  const values = [
    r.price_list_version,
    r.price_per_donum_kurus,
    r.minimum_fee_kurus,
    r.vat_rate_bp,
    r.estimate_subtotal_kurus,
    r.estimate_vat_kurus,
    r.estimate_total_kurus,
  ];
  const estimate: OfferEstimate | null = values.some((v) => v === null || v === undefined)
    ? null
    : {
        version: row.price_list_version,
        perDonum: row.price_per_donum_kurus,
        minimumFee: row.minimum_fee_kurus,
        vatRateBp: row.vat_rate_bp,
        subtotal: row.estimate_subtotal_kurus,
        vat: row.estimate_vat_kurus,
        total: row.estimate_total_kurus,
      };
  return {
    robot: robotModelOf({
      id: row.robot_model_id,
      code: row.code,
      name: row.name,
      short_description: row.short_description,
      capabilities: row.capabilities,
      image_path: row.image_path,
    }),
    isDefault: row.is_default === true,
    estimate,
  };
}

// The model preselected on the form: the one the database marks default,
// else the first.
export function defaultRobotOffer(offers: RobotOffer[]): RobotOffer | null {
  return offers.find((o) => o.isDefault) ?? offers[0] ?? null;
}
