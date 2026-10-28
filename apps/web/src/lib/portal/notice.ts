import type { Client } from "@/lib/supabase/types";

// First-login KVKK notice (kararlar.md T15, H30): an owner whose profile ops
// opened, or a co-owner who came through an invitation, reads the notice in
// the portal and records it with "Kaydet". It is an "okudum" confirmation,
// never an approval or a consent. The database decides whether it is due
// (public.portal_notice_status: the co-owner switch of the org, no own
// acknowledgement yet, never for a demo user).

export interface NoticeStatus {
  required: boolean;
  version: string | null;
}

export async function noticeStatus(supabase: Client): Promise<NoticeStatus> {
  const { data, error } = await supabase.rpc("portal_notice_status");
  if (error) {
    // An older database without T15: nothing is due.
    if (error.code === "PGRST202") return { required: false, version: null };
    throw error;
  }
  const status = (data ?? {}) as { required?: unknown; version?: unknown };
  return {
    required: status.required === true,
    version: typeof status.version === "string" ? status.version : null,
  };
}

export async function acknowledgeNotice(
  supabase: Client,
  version: string,
): Promise<{ ok: true } | { ok: false; error: "outdated" | "failed" }> {
  const { error } = await supabase.rpc("portal_acknowledge_kvkk_notice", {
    p_text_version: version,
  });
  if (!error) return { ok: true };
  return { ok: false, error: error.code === "22023" ? "outdated" : "failed" };
}
