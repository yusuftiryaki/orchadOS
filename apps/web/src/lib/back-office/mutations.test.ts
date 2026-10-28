import { describe, expect, it, vi } from "vitest";
import type { Client } from "@/lib/supabase/types";
import { saveSetting } from "./mutations";

// saveSetting while the web runs ahead of the database (PR previews, the
// deploy gap): the T21 keys are dropped only when the database lacks them.

type Reply = { data: unknown; error: { code?: string; message?: string; details?: string } | null };

function client(replies: Record<string, Reply[]>) {
  const rpc = vi.fn(async (name: string) => replies[name]!.shift()!);
  return { rpc, supabase: { rpc } as unknown as Client };
}

const SETTINGS = {
  accepts_signups: false,
  kep_address: "a@kep.tr",
  site_domain: null,
  kvkk_email: null,
};
const UNKNOWN_KEP = {
  data: null,
  error: { code: "22023", message: "invalid_input", details: "kep_address" },
};

describe("saveSetting", () => {
  it("saves without the T21 keys on a database without the registry", async () => {
    const { rpc, supabase } = client({
      ops_save_billing_setting: [UNKNOWN_KEP, { data: null, error: null }],
      public_company_info: [{ data: null, error: { code: "PGRST202", message: "not found" } }],
    });
    expect(await saveSetting(supabase, "org", SETTINGS)).toEqual({ ok: true, value: null });
    expect(rpc).toHaveBeenLastCalledWith("ops_save_billing_setting", {
      p_org_id: "org",
      p_settings: { accepts_signups: false },
    });
  });

  it("keeps a bad T21 value an error on a current database", async () => {
    const { rpc, supabase } = client({
      ops_save_billing_setting: [UNKNOWN_KEP],
      public_company_info: [{ data: [], error: null }],
    });
    const saved = await saveSetting(supabase, "org", SETTINGS);
    expect(saved.ok).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
