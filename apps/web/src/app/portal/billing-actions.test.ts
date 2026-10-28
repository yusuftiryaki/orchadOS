import { beforeEach, describe, expect, it, vi } from "vitest";
import { period } from "@/lib/portal-billing/garden-fixtures";
import type { ServicePeriod } from "@/lib/billing/types";

// The add-garden actions of a member (IP14, docs/bahce-yonetimi.md §2, §4.1):
// with garden changes closed no draft opens and none goes out, and a draft
// with another package is corrected to the membership's, keeping its note.
// The database is a fake that records the calls.

const state = vi.hoisted(() => ({
  periods: [] as unknown[],
  draft: null as Record<string, unknown> | null,
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  rpcError: null as { message: string; code?: string } | null,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/session", () => ({
  requireSection: async () => ({ id: "u1", email: null, roles: { customer: true }, demo: false }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      if (fn === "my_service_period") return { data: state.periods, error: null };
      state.calls.push({ fn, args });
      if (fn === "customer_create_application") return { data: APP, error: null };
      return { data: null, error: state.rpcError };
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: state.draft, error: null }),
      };
      return query;
    },
  }),
}));

const actions = await import("./billing-actions");

const APP = "00000000-0000-4000-8000-000000000002";
const MEMBER_PACKAGE = "00000000-0000-4000-8000-0000000000aa";
const OTHER_PACKAGE = "00000000-0000-4000-8000-0000000000bb";

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

async function run(action: (f: FormData) => Promise<unknown>, values: Record<string, string>) {
  try {
    await action(form(values));
    return "no redirect";
  } catch (error) {
    return (error as Error).message;
  }
}

const member = (over: Partial<ServicePeriod> = {}) =>
  period({ package_id: MEMBER_PACKAGE, garden_changes_enabled: true, ...over });

beforeEach(() => {
  state.periods = [];
  state.draft = null;
  state.calls = [];
  state.rpcError = null;
});

describe("a member with garden changes closed", () => {
  beforeEach(() => {
    state.periods = [member({ garden_changes_enabled: false })];
  });

  it("opens no draft", async () => {
    expect(await run(actions.createApplicationAction, { package_id: OTHER_PACKAGE })).toBe(
      "redirect /portal/basvuru/yeni?hata=garden_changes_closed",
    );
    expect(state.calls).toEqual([]);
  });

  it("submits no draft", async () => {
    expect(await run(actions.submitApplicationAction, { application_id: APP })).toBe(
      `redirect /portal/basvuru/${APP}?hata=garden_changes_closed`,
    );
    expect(state.calls).toEqual([]);
  });
});

describe("a member's draft package", () => {
  beforeEach(() => {
    state.periods = [member()];
  });

  it("opens with the membership's package and corrects an older draft, keeping its note", async () => {
    state.draft = {
      id: APP,
      status: "draft",
      package_id: OTHER_PACKAGE,
      customer_note: "Kapı şifresi 1234",
    };
    expect(await run(actions.createApplicationAction, { package_id: OTHER_PACKAGE })).toBe(
      `redirect /portal/basvuru/${APP}?bilgi=taslak_acildi`,
    );
    expect(state.calls).toEqual([
      { fn: "customer_create_application", args: { p_package_id: MEMBER_PACKAGE } },
      {
        fn: "customer_set_application_package",
        args: {
          p_application_id: APP,
          p_package_id: MEMBER_PACKAGE,
          p_customer_note: "Kapı şifresi 1234",
        },
      },
    ]);
  });

  it("is aligned before the draft goes out", async () => {
    state.draft = { id: APP, status: "draft", package_id: OTHER_PACKAGE, customer_note: null };
    expect(await run(actions.submitApplicationAction, { application_id: APP })).toBe(
      `redirect /portal/basvuru/${APP}?bilgi=basvuru_gonderildi`,
    );
    expect(state.calls).toEqual([
      {
        fn: "customer_set_application_package",
        args: { p_application_id: APP, p_package_id: MEMBER_PACKAGE },
      },
      { fn: "customer_submit_application", args: { p_application_id: APP } },
    ]);
  });

  it("is left alone when it already matches", async () => {
    state.draft = { id: APP, status: "draft", package_id: MEMBER_PACKAGE, customer_note: "x" };
    await run(actions.submitApplicationAction, { application_id: APP });
    expect(state.calls.map((c) => c.fn)).toEqual(["customer_submit_application"]);
  });
});

describe("a customer without a membership", () => {
  it("chooses the package and submits as before", async () => {
    expect(await run(actions.createApplicationAction, { package_id: OTHER_PACKAGE })).toBe(
      `redirect /portal/basvuru/${APP}?bilgi=taslak_acildi`,
    );
    await run(actions.submitApplicationAction, { application_id: APP });
    expect(state.calls.map((c) => c.fn)).toEqual([
      "customer_create_application",
      "customer_submit_application",
    ]);
    expect(state.calls[0].args).toEqual({ p_package_id: OTHER_PACKAGE });
  });
});

// docs/hukuk/kararlar.md H06, H31: no optional consent may be newly given
// while it is not asked; an earlier grant can always be withdrawn.
describe("setConsentAction", () => {
  it.each(["explicit_service_improvement", "explicit_marketing"])(
    "refuses to grant %s while it is not asked",
    async (kind) => {
      expect(await run(actions.setConsentAction, { kind, granted: "true" })).toBe(
        "redirect /portal/hesap/izinler?hata=consent_unavailable",
      );
      expect(state.calls).toEqual([]);
    },
  );

  it.each(["explicit_service_improvement", "explicit_marketing"])("withdraws %s", async (kind) => {
    expect(await run(actions.setConsentAction, { kind, granted: "false" })).toBe(
      "redirect /portal/hesap/izinler?bilgi=izin_kaydedildi",
    );
    expect(state.calls).toEqual([
      {
        fn: "customer_set_consent",
        args: { p_kind: kind, p_granted: false, p_text_version: "riza-v2-taslak" },
      },
    ]);
  });

  // T27: the database refuses an unasked consent too (consent_not_asked); the
  // portal shows its own text for it.
  it("shows consent_not_asked from the database as consent_unavailable", async () => {
    state.rpcError = { message: "consent_not_asked", code: "P0001" };
    expect(
      await run(actions.setConsentAction, { kind: "explicit_marketing", granted: "false" }),
    ).toBe("redirect /portal/hesap/izinler?hata=consent_unavailable");
  });

  it("rejects a kind that is not an optional consent", async () => {
    expect(await run(actions.setConsentAction, { kind: "kvkk_notice", granted: "false" })).toBe(
      "redirect /portal/hesap/izinler?hata=invalid_input",
    );
  });
});
