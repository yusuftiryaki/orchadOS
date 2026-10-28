import { requireUser } from "@/lib/auth/session";
import { contractDownload, contractFileName } from "@/lib/contracts/download";
import { customerDocuments } from "@/lib/contracts/generate";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// One of the customer's contract documents (Sözleşmelerim, T04).
// my_contract_documents lists only the caller's own documents (a demo
// visitor's call fails): anything else is 404, so nothing tells whether it
// exists.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (user.demo || !isUuid(id)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  let doc;
  try {
    doc = (await customerDocuments(supabase)).find((d) => d.id === id);
  } catch {
    doc = undefined;
  }
  return contractDownload(supabase, doc, contractFileName(doc?.kind ?? "", doc?.order_number));
}
