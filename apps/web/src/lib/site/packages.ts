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
