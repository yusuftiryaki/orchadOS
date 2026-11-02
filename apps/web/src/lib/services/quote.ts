// Pricing rule service-v1 of the service layer (IP15), the TypeScript twin of
// private.service_quote (supabase/migrations/20261106100100_service_layer.sql):
//
//   subtotal = max(round(ceil(round(area_m2, 2) / 100) x price_per_dönüm / 10), minimum fee)
//   vat      = round(subtotal x vat_rate_bp / 10000)
//   total    = subtotal + vat
//
// The area is counted in tenths of a dönüm (100 m²), rounded up, as in
// pricing-v1. Amounts are integer kuruş; rounding is half away from zero
// (Postgres round on numeric). Integer arithmetic only.

export const SERVICE_PRICING_RULE = "service-v1";

export interface ServiceQuote {
  subtotalKurus: number;
  vatKurus: number;
  totalKurus: number;
  // Tenths of a dönüm that were charged (before the minimum fee).
  tenths: number;
}

// round(a / b) for a >= 0, b > 0, half up.
function roundDiv(a: bigint, b: bigint): bigint {
  return (BigInt(2) * a + b) / (BigInt(2) * b);
}

// round(m², 2) as hundredths, on the decimal digits of the number (its
// shortest representation, as the database receives it), half up: 2000.005 is
// 200001, not the 200000 that binary floating point would give.
function hundredthsOf(areaM2: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(areaM2));
  if (!match) return BigInt(Math.round(areaM2 * 100));
  const fraction = match[2] ?? "";
  const kept = BigInt(match[1] + fraction.slice(0, 2).padEnd(2, "0"));
  return fraction.length > 2 && Number(fraction[2]) >= 5 ? kept + BigInt(1) : kept;
}

// null when an input is outside what the database accepts (it raises
// invalid_input / quote there).
export function serviceQuote(
  areaM2: number,
  pricePerDonumKurus: number,
  minimumFeeKurus: number,
  vatRateBp: number,
): ServiceQuote | null {
  if (
    !Number.isFinite(areaM2) ||
    areaM2 <= 0 ||
    !Number.isSafeInteger(pricePerDonumKurus) ||
    pricePerDonumKurus <= 0 ||
    !Number.isSafeInteger(minimumFeeKurus) ||
    minimumFeeKurus < 0 ||
    !Number.isInteger(vatRateBp) ||
    vatRateBp < 0 ||
    vatRateBp > 10000
  ) {
    return null;
  }
  // round(area, 2) in hundredths of a m², then tenths of a dönüm (10 000
  // hundredths of a m²) rounded up.
  const hundredths = hundredthsOf(areaM2);
  if (hundredths <= BigInt(0)) return null;
  const perTenth = BigInt(10000);
  const tenths = (hundredths + perTenth - BigInt(1)) / perTenth;
  const charged = roundDiv(tenths * BigInt(pricePerDonumKurus), BigInt(10));
  const minimum = BigInt(minimumFeeKurus);
  const subtotal = charged > minimum ? charged : minimum;
  const vat = roundDiv(subtotal * BigInt(vatRateBp), BigInt(10000));
  return {
    subtotalKurus: Number(subtotal),
    vatKurus: Number(vat),
    totalKurus: Number(subtotal + vat),
    tenths: Number(tenths),
  };
}
