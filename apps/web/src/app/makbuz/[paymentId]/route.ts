import { requireUser } from "@/lib/auth/session";
import { receiptPdf, type ReceiptData } from "@/lib/pdf/receipt-pdf";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The receipt of a payment as a PDF (§10). receipt_data() answers for the
// payment's customer and the org's ops only, null for anyone else (and for a
// payment without a receipt number): 404, so nothing tells whether it exists.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  await requireUser();
  const { paymentId } = await params;
  if (!isUuid(paymentId)) return new Response(null, { status: 404 });
  const { data, error } = await (
    await createClient()
  ).rpc("receipt_data", {
    p_payment_id: paymentId,
  });
  const receipt = error ? null : (data as unknown as ReceiptData | null);
  if (!receipt?.receipt_number) return new Response(null, { status: 404 });
  const body = await receiptPdf(receipt);
  const name = receipt.receipt_number.replace(/[^A-Za-z0-9-]/g, "");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=makbuz-${name}.pdf`,
      "Cache-Control": "private, no-store",
    },
  });
}
