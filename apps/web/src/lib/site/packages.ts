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

// Published packages of the org that takes sign-ups. Empty until İP12-D wires
// it to public_package_prices() (added by İP12-A1); the page then says that
// prices are set by quote.
export async function loadPublicPackages(supabase: Client): Promise<PublicPackage[]> {
  void supabase;
  return [];
}

// unit_price_kurus is per dönüm and per visit (design §6.6: visit_amount =
// visits × tenths × unit_price / 10). The annual price of one dönüm, before
// the minimum fee and the inventory fee.
export function annualPerDonumKurus(
  pkg: Pick<PublicPackage, "unitPriceKurus" | "periodicVisitsPerYear">,
): number {
  return pkg.unitPriceKurus * pkg.periodicVisitsPerYear;
}
