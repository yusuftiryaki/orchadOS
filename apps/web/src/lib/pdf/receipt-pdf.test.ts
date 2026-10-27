import { describe, expect, it } from "vitest";
import { receiptPdf, type ReceiptData } from "./receipt-pdf";

const RECEIPT: ReceiptData = {
  receipt_number: "M-2026-000001",
  status: "succeeded",
  issued_at: "2026-10-27T10:00:00Z",
  provider: "iyzico",
  amount_kurus: 1200000,
  paid_kurus: 1200000,
  refunded_kurus: 0,
  currency: "TRY",
  installment: 1,
  card_association: "MASTER_CARD",
  card_last4: "0000",
  bank_reference: null,
  value_date: null,
  order_number: "S-2026-000001",
  package_name: "Standart",
  service_start: "2026-11-01",
  service_end: "2027-10-31",
  items: [{ line_no: 1, name: "Şahinbey Ğ bahçesi", amount_kurus: 1200000 }],
  buyer: {
    name: "Ayşe Yılmaz",
    identity_number_masked: null,
    company_title: null,
    tax_office: null,
    tax_number: null,
    address: "Cumhuriyet Mah.",
    district: "Nizip",
    city: "Gaziantep",
  },
  seller: {
    legal_name: "Örnek Tarım A.Ş.",
    tax_office: "Şahinbey",
    tax_number: "1234567890",
    mersis_number: null,
    address: "Gaziantep",
    phone: null,
    email: "destek@example.com",
  },
  refunds: [
    { number: "I-2026-000001", amount_kurus: 100000, processed_at: "2026-10-28T10:00:00Z" },
  ],
};

// Renders a real PDF with the bundled fonts (no browser).
describe("receipt pdf", () => {
  it("renders a card receipt with Turkish text", async () => {
    const buf = await receiptPdf(RECEIPT, new Date("2026-10-27T10:00:00Z"));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
    // The document title (an uncompressed info entry) names it a receipt.
    expect(buf.toString("latin1")).toMatch(/\/Title/);
  }, 30_000);

  it("renders a bank transfer receipt without card or seller details", async () => {
    const buf = await receiptPdf({
      ...RECEIPT,
      provider: "manual",
      card_association: null,
      card_last4: null,
      installment: null,
      bank_reference: "EFT-123",
      value_date: "2026-10-27",
      refunds: [],
      seller: {
        legal_name: null,
        tax_office: null,
        tax_number: null,
        mersis_number: null,
        address: null,
        phone: null,
        email: null,
      },
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});
