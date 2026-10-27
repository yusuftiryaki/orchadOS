import { describe, expect, it } from "vitest";
import { receiptText as R } from "@/lib/i18n/messages/receipt";
import { receiptPdf, receiptTotals, type ReceiptData } from "./receipt-pdf";

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

// The document title from the PDF info dictionary. react-pdf writes it as an
// indirect object holding a string: UTF-16BE hex with a byte order mark
// (<FEFF…>) or a literal.
function pdfTitle(buf: Buffer): string | null {
  const text = buf.toString("latin1");
  let value = /\/Title\s*(<[^>]*>|\((?:\\.|[^\\)])*\)|\d+ \d+ R)/.exec(text)?.[1];
  const ref = value && /^(\d+) (\d+) R$/.exec(value);
  if (ref) {
    const obj = new RegExp(
      `(?:^|\\s)${ref[1]} ${ref[2]} obj\\s*(<[^>]*>|\\((?:\\\\.|[^\\\\)])*\\))`,
    );
    value = obj.exec(text)?.[1];
  }
  if (!value) return null;
  const bytes = value.startsWith("<")
    ? Buffer.from(value.slice(1, -1).replace(/\s/g, ""), "hex")
    : Buffer.from(
        value
          .slice(1, -1)
          .replace(/\\([0-7]{1,3}|[\s\S])/g, (_, c: string) =>
            /^[0-7]+$/.test(c)
              ? String.fromCharCode(parseInt(c, 8))
              : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[c] ?? c),
          ),
        "latin1",
      );
  return bytes[0] === 0xfe && bytes[1] === 0xff
    ? Buffer.from(bytes.subarray(2)).swap16().toString("utf16le")
    : bytes.toString("latin1");
}

// Renders a real PDF with the bundled fonts (no browser).
describe("receipt pdf", () => {
  it("renders a card receipt with Turkish text", async () => {
    const buf = await receiptPdf(RECEIPT, new Date("2026-10-27T10:00:00Z"));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
    // The document title says it is a receipt, not an invoice, and its number.
    expect(R.title).toBe("Ödeme makbuzu (fatura değildir)");
    expect(pdfTitle(buf)).toBe("Ödeme makbuzu (fatura değildir) M-2026-000001");
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

  it("totals the items, not the provider's charge", () => {
    // Paid in full, one refund: the total is the items' sum, then a net row.
    expect(receiptTotals(RECEIPT)).toEqual({
      rows: [{ label: R.total, kurus: 1200000, strong: true }],
      netKurus: 1200000,
    });
    // Installment interest (paidPrice 12 480 ₺) gets its own rows.
    const installments = receiptTotals({
      ...RECEIPT,
      installment: 6,
      paid_kurus: 1248000,
      refunded_kurus: 100000,
    });
    expect(installments.rows).toEqual([
      { label: R.total, kurus: 1200000, strong: true },
      { label: R.installmentFee, kurus: 48000 },
      { label: R.charged, kurus: 1248000, strong: true },
    ]);
    expect(installments.netKurus).toBe(1148000);
    expect(receiptTotals({ ...RECEIPT, refunds: [] }).netKurus).toBeNull();
  });
});
