import type { Client } from "@/lib/supabase/types";

// The expert who approved (signed and published) a visit, as the report and
// its PDFs name them: "Onaylayan uzman: <Ad Soyad>, <unvan>" (kararlar.md H05,
// T23). The database returns null in the demo and when ops has not entered
// the name (public.visit_approver); without a title only the name is shown
// and ops is warned on the staff list.

export interface Approver {
  name: string;
  title: string | null;
}

export function parseApprover(value: unknown): Approver | null {
  if (!value || typeof value !== "object") return null;
  const { name, title } = value as { name?: unknown; title?: unknown };
  if (typeof name !== "string" || name.trim() === "") return null;
  return { name: name.trim(), title: typeof title === "string" && title.trim() ? title.trim() : null };
}

export function approverLine(approver: Approver): string {
  return approver.title
    ? `Onaylayan uzman: ${approver.name}, ${approver.title}`
    : `Onaylayan uzman: ${approver.name}`;
}

// PGRST202: the function is not on this database yet (a preview against an
// older hosted database); the report then shows no line.
export async function visitApprover(
  supabase: Client,
  sessionId: string | null | undefined,
): Promise<Approver | null> {
  if (!sessionId) return null;
  const { data, error } = await supabase.rpc("visit_approver", { p_session_id: sessionId });
  if (error) {
    if (error.code === "PGRST202") return null;
    throw error;
  }
  return parseApprover(data);
}
