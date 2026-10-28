import type { Client } from "@/lib/supabase/types";

// A package with its published price, as shown on /paketler. Amounts are in
// kuruş; the VAT rate in basis points (docs/musteri-yonetimi.md §6.6).
export interface PublicPackage {
  packageId: string;
  code: string;
  name: string;
  description: string | null;
  periodicVisitsPerYear: number;
  includesInventory: boolean;
  priceListVersion: number;
  validFrom: string;
  currency: string;
  vatRateBp: number;
  unitPriceKurus: number;
  minimumFeeKurus: number;
  inventoryFeeKurus: number;
}

// Published packages of the org that takes sign-ups, with the prices of the
// list valid today (public_package_prices, callable without a session). An
// empty list (none published, or the call failed) makes the page say that
// prices are set by quote.
export async function loadPublicPackages(supabase: Client): Promise<PublicPackage[]> {
  const { data, error } = await supabase.rpc("public_package_prices");
  if (error || !data) return [];
  return data.map((r) => ({
    packageId: r.package_id,
    code: r.code,
    name: r.name,
    description: r.description ?? null,
    periodicVisitsPerYear: r.periodic_visits_per_year,
    includesInventory: r.includes_inventory,
    priceListVersion: r.price_list_version,
    validFrom: r.valid_from,
    currency: r.currency,
    vatRateBp: r.vat_rate_bp,
    unitPriceKurus: r.unit_price_kurus,
    minimumFeeKurus: r.minimum_fee_kurus,
    inventoryFeeKurus: r.inventory_fee_kurus,
  }));
}

export interface PackageExample {
  areaM2: number;
  firstYear: boolean;
  subtotalKurus: number;
  vatKurus: number;
  totalKurus: number;
}

// The fee of one garden of `areaM2` (§6.6 example: 20 dönüm) in the first
// year (with the inventory fee) or a later year, computed by the database's
// own formula (price_preview, callable without a session), so the page never
// shows a figure the quote would not.
export async function loadPackageExample(
  supabase: Client,
  packageId: string,
  areaM2: number,
  firstYear: boolean,
): Promise<PackageExample | null> {
  const { data, error } = await supabase.rpc("price_preview", {
    p_package_id: packageId,
    p_areas_m2: [areaM2],
    p_first_year: firstYear,
  });
  const line = error ? undefined : data?.[0];
  if (!line) return null;
  return {
    areaM2,
    firstYear,
    subtotalKurus: line.line_subtotal_kurus,
    vatKurus: line.line_vat_kurus,
    totalKurus: line.line_total_kurus,
  };
}

// unit_price_kurus is per dönüm and per visit (design §6.6: visit_amount =
// visits × tenths × unit_price / 10). The annual price of one dönüm, before
// the minimum fee and the inventory fee.
export function annualPerDonumKurus(
  pkg: Pick<PublicPackage, "unitPriceKurus" | "periodicVisitsPerYear">,
): number {
  return pkg.unitPriceKurus * pkg.periodicVisitsPerYear;
}

// A list amount (VAT excluded) as the consumer pays it: VAT included, rounded
// half up to the kuruş like line_vat (§6.6). For display; a quote rounds its
// VAT once per line.
export function withVatKurus(kurus: number, vatRateBp: number): number {
  return kurus + Math.round((kurus * vatRateBp) / 10000);
}
