import { canAccessSection } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { contractDownload, contractFileName } from "@/lib/contracts/download";
import { opsDocuments } from "@/lib/contracts/generate";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// A contract document of an order for ops (T04): also the copy handed to a
// customer whose portal access has ended (H12). ops_contract_documents
// answers only for ops of the order's org.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const user = await requireUser();
  if (!canAccessSection(user.roles, "operasyon")) return new Response(null, { status: 403 });
  const { id, docId } = await params;
  if (!isUuid(id) || !isUuid(docId)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  let doc;
  let number: string | null = null;
  try {
    doc = (await opsDocuments(supabase, id)).find((d) => d.id === docId);
    const { data } = await supabase
      .from("service_order")
      .select("number")
      .eq("id", id)
      .maybeSingle();
    number = data?.number ?? null;
  } catch {
    doc = undefined;
  }
  return contractDownload(supabase, doc, contractFileName(doc?.kind ?? "", number));
}
