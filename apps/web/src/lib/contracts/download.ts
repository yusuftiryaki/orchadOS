import "server-only";
import { sha256Hex } from "@/lib/legal/text-hash";
import type { Client } from "@/lib/supabase/types";
import type { ContractDocumentRow } from "./generate";

export const CONTRACT_BUCKET = "contract-documents";

// A stored contract PDF as a private, uncached download (like the receipt
// route): read from the private bucket with the caller's own session (the
// bucket's policy: the order's customer and the org's ops) and checked
// against the registered SHA-256 before it is served. Never logged.
export async function contractDownload(
  supabase: Client,
  doc: ContractDocumentRow | undefined,
  fileName: string,
): Promise<Response> {
  if (!doc)
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const { data, error } = await supabase.storage.from(CONTRACT_BUCKET).download(doc.storage_path);
  if (error || !data) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (sha256Hex(bytes) !== doc.sha256) {
    return new Response(null, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${fileName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const KIND_FILE: Record<string, string> = {
  pre_information: "on-bilgilendirme",
  distance_sales: "mesafeli-sozlesme",
  withdrawal_confirmation: "cayma-suresi",
};

// "mesafeli-sozlesme-S-2026-000001.pdf" (ASCII only).
export function contractFileName(kind: string, orderNumber: string | null | undefined): string {
  const number = (orderNumber ?? "").replace(/[^A-Za-z0-9-]/g, "");
  return `${KIND_FILE[kind] ?? "belge"}${number ? `-${number}` : ""}.pdf`;
}
