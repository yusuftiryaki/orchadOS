import type { CompanyFields } from "@/lib/legal/company-placeholders";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import type { ContractInput } from "./model";

// Synthetic inputs of the unit tests: an initial, an add-on and a renewal
// quote of the same customer.

export const COMPANY: CompanyFields = {
  legal_name: "Örnek Denetim Hizmetleri A.Ş.",
  mersis_number: "0123456789000015",
  address: "Örnek Mah. Test Cad. No: 1, Şahinbey / Gaziantep",
  phone: "+90 342 000 00 00",
  email: "destek@orchados.example",
  kep_address: "ornek@hs01.kep.tr",
  tax_office: "Şahinbey",
  tax_number: "1234567890",
  site_domain: "orchados.example",
  kvkk_email: "kvkk@orchados.example",
  complete: true,
};

export function initialInput(overrides: Partial<ContractInput> = {}): ContractInput {
  return {
    quote: {
      id: "11111111-1111-4111-8111-111111111111",
      number: "T-2026-000001",
      packageName: "Standart",
      visitsPerYear: 4,
      includesInventory: true,
      firstYear: true,
      currency: "TRY",
      baseKurus: 1_500_000,
      discountKurus: 150_000,
      discountBp: 1000,
      discountNote: "Pilot indirimi",
      subtotalKurus: 1_350_000,
      vatRateBp: 2000,
      vatKurus: 270_000,
      totalKurus: 1_620_000,
      validUntil: "2026-11-15",
      proposedServiceStart: null,
      addonOfOrderId: null,
      renewalOfOrderId: null,
      inputs: {},
    },
    lines: [
      {
        lineNo: 1,
        gardenName: "Şahinbey Ğ bahçesi",
        location: "Gaziantep / Nizip / Test",
        areaM2: 20_000,
        visits: 4,
        unitPriceKurus: 15_000,
        minimumFeeKurus: 500_000,
        inventoryFeeKurus: 300_000,
        lineBaseKurus: 1_500_000,
      },
    ],
    order: null,
    buyer: {
      name: "Ayşe Yılmaz",
      companyTitle: null,
      taxOffice: null,
      taxNumber: null,
      address: "Cumhuriyet Mah. 1. Sok. No: 2, Nizip, Gaziantep",
      phone: "+905550000001",
      email: "ayse@example.com",
    },
    company: COMPANY,
    versions: {
      pre_information: LEGAL_TEXT_VERSIONS.pre_information,
      distance_sales: LEGAL_TEXT_VERSIONS.distance_sales,
    },
    today: "2026-10-28",
    ...overrides,
  };
}

const ADDON_INPUTS = {
  addon: {
    base_order_number: "S-2026-000001",
    service_start: "2027-04-01",
    period_start: "2026-11-01",
    period_end: "2027-10-31",
    remaining_days: 214,
    period_days: 365,
    visits_per_year: 4,
    raw_visits: 2.35,
    rounded_visits: 2,
    visits: 2,
    price_list_name: "Lansman fiyat listesi (v1)",
    remaining_windows: [
      {
        code: "spring",
        name: "İlkbahar",
        label: "İlkbahar 2027",
        start: "2027-04-01",
        end: "2027-05-31",
      },
      { code: "summer", name: "Yaz", label: "Yaz 2027", start: "2027-06-15", end: "2027-08-15" },
    ],
    lines: [
      {
        line_no: 1,
        garden_name: "Yeni bahçe",
        area_m2: 15000,
        visits: 2,
        unit_price_kurus: 15000,
        visit_amount_kurus: 450000,
        minimum_fee_kurus: 293151,
        basis: "visits",
        inventory_fee_kurus: 300000,
        inventory_reason: "new_garden",
        inventory_note: null,
        last_inventory_on: null,
        line_subtotal_kurus: 750000,
        line_vat_kurus: 150000,
        line_total_kurus: 900000,
        full_year_total_kurus: 1380000,
      },
    ],
  },
};

export function addonInput(): ContractInput {
  const base = initialInput();
  return {
    ...base,
    quote: {
      ...base.quote,
      id: "22222222-2222-4222-8222-222222222222",
      number: "T-2026-000002",
      firstYear: false,
      baseKurus: 750_000,
      discountKurus: 0,
      discountBp: 0,
      discountNote: null,
      subtotalKurus: 750_000,
      vatKurus: 150_000,
      totalKurus: 900_000,
      proposedServiceStart: "2027-04-01",
      addonOfOrderId: "33333333-3333-4333-8333-333333333333",
      inputs: ADDON_INPUTS,
    },
    lines: [
      {
        lineNo: 1,
        gardenName: "Yeni bahçe",
        location: null,
        areaM2: 15_000,
        visits: 2,
        unitPriceKurus: 15_000,
        minimumFeeKurus: 293_151,
        inventoryFeeKurus: 300_000,
        lineBaseKurus: 750_000,
      },
    ],
  };
}

export function renewalInput(): ContractInput {
  const base = initialInput();
  return {
    ...base,
    quote: {
      ...base.quote,
      id: "44444444-4444-4444-8444-444444444444",
      number: "T-2027-000010",
      firstYear: false,
      discountKurus: 0,
      discountBp: 0,
      discountNote: null,
      baseKurus: 1_200_000,
      subtotalKurus: 1_200_000,
      vatKurus: 240_000,
      totalKurus: 1_440_000,
      proposedServiceStart: "2027-11-01",
      renewalOfOrderId: "33333333-3333-4333-8333-333333333333",
    },
  };
}

// The initial quote once accepted and paid on 1 March 2027 (10:00 Istanbul).
export function activeInput(): ContractInput {
  return initialInput({
    order: {
      id: "55555555-5555-4555-8555-555555555555",
      number: "S-2027-000003",
      activatedAt: "2027-03-01T07:00:00Z",
      serviceStart: "2027-03-01",
      serviceEnd: "2028-02-29",
    },
  });
}
