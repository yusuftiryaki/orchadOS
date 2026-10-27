// Texts of the payment receipt PDF (src/lib/pdf/receipt-pdf.tsx).
export const receiptText = {
  kicker: "Makbuz",
  title: "Ödeme makbuzu (fatura değildir)",
  number: (n: string) => `Makbuz no: ${n}`,
  seller: "Hizmet veren",
  buyer: "Ödeyen",
  tax: (office: string | null, number: string | null) =>
    [office ? `${office} V.D.` : null, number ? `VKN ${number}` : null].filter(Boolean).join(" · "),
  mersis: (n: string) => `MERSİS ${n}`,
  identity: (masked: string) => `T.C. kimlik no: ${masked}`,
  payment: "Ödeme",
  date: "Ödeme tarihi",
  order: "Sipariş",
  package: "Paket",
  service: "Hizmet dönemi",
  method: "Ödeme yöntemi",
  installment: "Taksit",
  bankReference: "Banka referansı",
  valueDate: "Valör",
  items: "Kalemler",
  total: "Ödenen tutar",
  vatIncluded: "Tutarlara KDV dahildir.",
  refunds: "İadeler",
  notInvoice:
    "Bu belge ödemenin alındığını gösterir; fatura yerine geçmez. Faturanız ayrıca düzenlenir.",
  footer: (n: string, at: string) => `${n} · oluşturma ${at}`,
} as const;
