import "server-only";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatKurus } from "@/lib/billing/money";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { receiptText as R } from "@/lib/i18n/messages/receipt";
import { Footer, Header } from "./parts";
import { pdf, registerFonts } from "./theme";

// The payment receipt (docs/musteri-yonetimi.md §10): what receipt_data()
// returns, as a one-page PDF. A receipt is not an invoice; the title says so.

export interface ReceiptData {
  receipt_number: string;
  status: string;
  issued_at: string | null;
  provider: "iyzico" | "manual" | "fake";
  amount_kurus: number;
  paid_kurus: number;
  refunded_kurus: number;
  currency: string;
  installment: number | null;
  card_association: string | null;
  card_last4: string | null;
  bank_reference: string | null;
  value_date: string | null;
  order_number: string;
  package_name: string | null;
  service_start: string | null;
  service_end: string | null;
  items: { line_no: number; name: string; amount_kurus: number }[];
  buyer: {
    name: string | null;
    identity_number_masked: string | null;
    company_title: string | null;
    tax_office: string | null;
    tax_number: string | null;
    address: string | null;
    district: string | null;
    city: string | null;
  };
  seller: {
    legal_name: string | null;
    tax_office: string | null;
    tax_number: string | null;
    mersis_number: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  refunds: { number: string; amount_kurus: number; processed_at: string | null }[];
}

// The money rows under the items: the total is the items' sum (amount_kurus).
// The provider's charge (paid_kurus) differs only with installment interest
// and then gets its own rows; with refunds a net row closes the receipt.
export function receiptTotals(receipt: ReceiptData): {
  rows: { label: string; kurus: number; strong?: boolean }[];
  netKurus: number | null;
} {
  const rows: { label: string; kurus: number; strong?: boolean }[] = [
    { label: R.total, kurus: receipt.amount_kurus, strong: true },
  ];
  if (receipt.paid_kurus !== receipt.amount_kurus) {
    rows.push({ label: R.installmentFee, kurus: receipt.paid_kurus - receipt.amount_kurus });
    rows.push({ label: R.charged, kurus: receipt.paid_kurus, strong: true });
  }
  const netKurus = receipt.refunds.length > 0 ? receipt.paid_kurus - receipt.refunded_kurus : null;
  return { rows, netKurus };
}

export async function receiptPdf(receipt: ReceiptData, now = new Date()): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReceiptDocument receipt={receipt} now={now} />);
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={pdf.row}>
      <Text style={pdf.muted}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ");

function ReceiptDocument({ receipt, now }: { receipt: ReceiptData; now: Date }) {
  const money = (k: number) => formatKurus(k, receipt.currency);
  const b = receipt.buyer;
  const s = receipt.seller;
  const totals = receiptTotals(receipt);
  const method =
    receipt.provider === "manual"
      ? billingText.paymentProvider.manual
      : [
          billingText.paymentProvider[receipt.provider],
          receipt.card_association,
          receipt.card_last4 ? `•••• ${receipt.card_last4}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  return (
    <Document title={`${R.title} ${receipt.receipt_number}`} author="orchadOS" language="tr">
      <Page size="A4" style={pdf.page}>
        <Header kicker={R.kicker} title={R.title} subtitle={R.number(receipt.receipt_number)} />

        <View style={pdf.columns}>
          <View style={[pdf.column, pdf.section]}>
            <Text style={pdf.h3}>{R.seller}</Text>
            <Text>{s.legal_name ?? "orchadOS"}</Text>
            {s.address ? <Text style={pdf.muted}>{s.address}</Text> : null}
            {s.tax_office || s.tax_number ? (
              <Text style={pdf.muted}>{R.tax(s.tax_office, s.tax_number)}</Text>
            ) : null}
            {s.mersis_number ? <Text style={pdf.muted}>{R.mersis(s.mersis_number)}</Text> : null}
            {s.phone || s.email ? <Text style={pdf.muted}>{join(s.phone, s.email)}</Text> : null}
          </View>
          <View style={[pdf.column, pdf.section]}>
            <Text style={pdf.h3}>{R.buyer}</Text>
            {b.company_title ? <Text>{b.company_title}</Text> : null}
            {b.name ? <Text>{b.name}</Text> : null}
            {b.address ? (
              <Text style={pdf.muted}>{join(b.address, b.district, b.city)}</Text>
            ) : null}
            {b.tax_office || b.tax_number ? (
              <Text style={pdf.muted}>{R.tax(b.tax_office, b.tax_number)}</Text>
            ) : null}
            {b.identity_number_masked ? (
              <Text style={pdf.muted}>{R.identity(b.identity_number_masked)}</Text>
            ) : null}
          </View>
        </View>

        <View style={pdf.section}>
          <Text style={pdf.h2}>{R.payment}</Text>
          <Row
            label={R.date}
            value={receipt.issued_at ? formatDateTime(receipt.issued_at) : null}
          />
          <Row label={R.order} value={receipt.order_number} />
          <Row label={R.package} value={receipt.package_name} />
          <Row
            label={R.service}
            value={
              receipt.service_start && receipt.service_end
                ? `${formatDate(receipt.service_start)} – ${formatDate(receipt.service_end)}`
                : null
            }
          />
          <Row label={R.method} value={method} />
          <Row
            label={R.installment}
            value={
              receipt.installment && receipt.installment > 1 ? String(receipt.installment) : null
            }
          />
          <Row label={R.bankReference} value={receipt.bank_reference} />
          <Row
            label={R.valueDate}
            value={receipt.value_date ? formatDate(receipt.value_date) : null}
          />
        </View>

        <View style={pdf.section}>
          <Text style={pdf.h2}>{R.items}</Text>
          {receipt.items.map((item) => (
            <View key={item.line_no} style={pdf.row}>
              <Text>{item.name}</Text>
              <Text>{money(item.amount_kurus)}</Text>
            </View>
          ))}
          {totals.rows.map((row) => (
            <View key={row.label} style={pdf.row}>
              <Text style={row.strong ? pdf.h3 : pdf.muted}>{row.label}</Text>
              <Text style={row.strong ? pdf.h3 : undefined}>{money(row.kurus)}</Text>
            </View>
          ))}
          <Text style={pdf.muted}>{R.vatIncluded}</Text>
        </View>

        {receipt.refunds.length > 0 ? (
          <View style={pdf.section}>
            <Text style={pdf.h2}>{R.refunds}</Text>
            {receipt.refunds.map((r) => (
              <View key={r.number} style={pdf.row}>
                <Text>{`${r.number}${r.processed_at ? ` · ${formatDate(r.processed_at)}` : ""}`}</Text>
                <Text>{money(-r.amount_kurus)}</Text>
              </View>
            ))}
            {totals.netKurus !== null ? (
              <View style={pdf.row}>
                <Text style={pdf.h3}>{R.net}</Text>
                <Text style={pdf.h3}>{money(totals.netKurus)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={pdf.notice}>
          <Text>{R.notInvoice}</Text>
        </View>
        <Footer left={R.footer(receipt.receipt_number, formatDateTime(now.toISOString()))} />
      </Page>
    </Document>
  );
}
