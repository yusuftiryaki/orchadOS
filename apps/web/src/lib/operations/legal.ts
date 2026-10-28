import type { Client } from "@/lib/supabase/types";

// Operations side of the legal follow-ups, wave 2 (docs/hukuk/kararlar.md):
// staff names and titles (T23), hidden media (T20), boundary disputes (T16)
// and KVKK applications (T11). The ops_* functions check the role, write the
// audit log and refuse demo callers; these helpers only map their errors to
// the codes the pages show (t.legal.errors).

export type LegalError =
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "demo_read_only"
  | "already_hidden"
  | "not_hidden"
  | "dispute_open"
  | "no_open_dispute"
  | "failed";

const KNOWN: LegalError[] = [
  "forbidden",
  "not_found",
  "invalid_input",
  "demo_read_only",
  "already_hidden",
  "not_hidden",
  "dispute_open",
  "no_open_dispute",
];

export type LegalResult = { ok: true } | { ok: false; error: LegalError };

export function legalError(error: { code?: string; message?: string }): LegalError {
  const message = error.message ?? "";
  if ((KNOWN as string[]).includes(message)) return message as LegalError;
  if (error.code === "42501") return "forbidden";
  if (error.code === "P0002") return "not_found";
  if (error.code === "22023") return "invalid_input";
  return "failed";
}

const result = ({ error }: { error: { code?: string; message?: string } | null }): LegalResult =>
  error ? { ok: false, error: legalError(error) } : { ok: true };

// ---------------------------------------------------------------------------
// Staff (T23)
// ---------------------------------------------------------------------------

export interface StaffMember {
  userId: string;
  roles: string[];
  email: string | null;
  fullName: string | null;
  title: string | null;
}

export async function listStaff(supabase: Client, orgId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase.rpc("ops_staff", { p_org_id: orgId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    roles: r.roles ?? [],
    email: r.email,
    fullName: r.full_name,
    title: r.title,
  }));
}

export async function saveStaffProfile(
  supabase: Client,
  input: { orgId: string; userId: string; fullName: string; title: string },
): Promise<LegalResult> {
  return result(
    await supabase.rpc("ops_save_staff_profile", {
      p_org_id: input.orgId,
      p_user_id: input.userId,
      p_full_name: input.fullName,
      p_title: input.title,
    }),
  );
}

// ?bilgi=<notice> / ?hata=<error> of these pages: only known codes are read.
export function readLegalResult(params: Record<string, string | string[] | undefined>): {
  notice: string | null;
  error: string | null;
} {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const notice = one(params.bilgi);
  const error = one(params.hata);
  return {
    notice: notice && /^[a-z_]{1,40}$/.test(notice) ? notice : null,
    error: error && /^[a-z_]{1,40}$/.test(error) ? error : null,
  };
}
