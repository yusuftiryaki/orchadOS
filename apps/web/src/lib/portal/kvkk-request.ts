import type { Client } from "@/lib/supabase/types";

// The portal KVKK application form (kararlar.md T11, H26;
// docs/hukuk/kvkk-basvuru-proseduru.md): a signed-in owner, co-owner or
// customer files a request; ops answers within 30 days. Only while the org's
// kvkk_request_form_enabled switch is on (public.portal_kvkk_form_enabled).
// The message is personal data: never logged.

export const KVKK_REQUEST_TYPES = [
  "access",
  "rectification",
  "erasure",
  "objection",
  "other",
] as const;
export type KvkkRequestType = (typeof KVKK_REQUEST_TYPES)[number];

export interface MyKvkkRequest {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  dueAt: string;
  settledAt: string | null;
}

export async function kvkkFormEnabled(supabase: Client): Promise<boolean> {
  const { data, error } = await supabase.rpc("portal_kvkk_form_enabled");
  if (error) {
    if (error.code === "PGRST202") return false;
    throw error;
  }
  return data === true;
}

export async function myKvkkRequests(supabase: Client): Promise<MyKvkkRequest[]> {
  const { data, error } = await supabase.rpc("my_kvkk_requests");
  if (error) {
    if (error.code === "PGRST202") return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.request_type,
    status: r.status,
    createdAt: r.created_at,
    dueAt: r.due_at,
    settledAt: r.settled_at,
  }));
}

export type FileResult =
  | { ok: true }
  | { ok: false; error: "invalid_type" | "invalid_message" | "too_many" | "forbidden" | "failed" };

export async function fileKvkkRequest(
  supabase: Client,
  type: string,
  message: string,
): Promise<FileResult> {
  if (!(KVKK_REQUEST_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "invalid_type" };
  }
  const text = message.trim();
  if (text.length < 1 || text.length > 2000) return { ok: false, error: "invalid_message" };
  const { error } = await supabase.rpc("portal_file_kvkk_request", {
    p_type: type,
    p_message: text,
  });
  if (!error) return { ok: true };
  if (error.message === "too_many_requests") return { ok: false, error: "too_many" };
  if (error.code === "42501" || error.message === "demo_read_only")
    return { ok: false, error: "forbidden" };
  return { ok: false, error: "failed" };
}
