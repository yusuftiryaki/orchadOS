import { beforeEach, describe, expect, it, vi } from "vitest";

// Defence in depth for a demo visitor (docs/demo-turu.md §6.3, §11.5): every
// owner and billing server action refuses with demo_read_only before it opens
// a database client. The UI hides the forms and the database guard refuses
// the writes too; these tests keep the action layer from regressing silently,
// including actions added later (they iterate over every export).

const state = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  user: {
    id: "u1",
    email: null,
    roles: { orgRoles: [], parcelRoles: ["owner"], customer: true },
    demo: true,
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  forbidden: () => {
    throw new Error("forbidden");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: state.createClient }));
vi.mock("@/lib/auth/session", () => ({ requireSection: async () => state.user }));

const parcelActions = await import("./parsel/[parcelId]/actions");
const billingActions = await import("./billing-actions");
const { assertCustomer } = await import("@/lib/portal-billing/session");

const PARCEL = "00000000-0000-4000-8000-000000000001";
const ID = "00000000-0000-4000-8000-000000000002";

// A form that would pass every action's own input checks.
function fullForm(): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries({
    parcelId: PARCEL,
    target: "parcel",
    body: "Soru",
    questionId: ID,
    id: ID,
    kind: "explicit_marketing",
    granted: "true",
    name: "Ali",
    phone: "05320000000",
    application_id: ID,
    package_id: ID,
    garden_id: ID,
    quote_id: ID,
    order_id: ID,
    parcel_id: PARCEL,
    removal_id: ID,
    reason: "sold",
    timing: "notice",
    confirm: "on",
    distance_sales: "on",
    pre_information: "on",
    kvkk_notice: "on",
    full_name: "Ali",
    email: "a@example.com",
  })) {
    form.set(k, v);
  }
  return form;
}

type Action = (...args: unknown[]) => Promise<unknown>;

async function outcome(action: Action): Promise<string> {
  // Two-argument actions are useActionState handlers (previous state, form),
  // or approveBoundaryAction (parcel, boundary).
  const args =
    action.length >= 2 ? [{ error: null, fieldErrors: {}, values: {} }, fullForm()] : [fullForm()];
  try {
    return JSON.stringify(await action(...args));
  } catch (error) {
    return (error as Error).message;
  }
}

const entries = (mod: Record<string, unknown>) =>
  Object.entries(mod).filter((e): e is [string, Action] => typeof e[1] === "function");

beforeEach(() => {
  state.createClient.mockReset();
  state.createClient.mockImplementation(async () => {
    throw new Error("createClient called");
  });
  state.revalidatePath.mockReset();
});

describe("demo visitor at the action layer", () => {
  it("covers every owner and billing action", () => {
    expect(
      entries(parcelActions)
        .map(([n]) => n)
        .sort(),
    ).toEqual([
      "approveBoundaryAction",
      "askQuestionAction",
      "cancelGardenRemovalAction",
      "cancelInvitationAction",
      "editQuestionAction",
      "inviteViewerAction",
      "postponeVisitAction",
      "removeViewerAction",
      "replyQuestionAction",
      "requestGardenRemovalAction",
    ]);
    expect(entries(billingActions).length).toBeGreaterThanOrEqual(14);
  });

  it.each(entries(parcelActions))("%s refuses with demo_read_only", async (_name, action) => {
    const result = await outcome(action);
    expect(result).toContain("demo_read_only");
    expect(state.createClient).not.toHaveBeenCalled();
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(entries(billingActions))("%s refuses before any call", async (_name, action) => {
    const result = await outcome(action);
    // Plain forms go back to the gardens with ?hata=demo_read_only; the
    // useActionState forms answer with the "Demoda kapalı" text.
    expect(
      result === "redirect /portal?hata=demo_read_only" || result.includes("Demoda kapalı"),
    ).toBe(true);
    expect(state.createClient).not.toHaveBeenCalled();
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps a demo visitor off the billing pages", () => {
    expect(() => assertCustomer(state.user as never)).toThrow("redirect /portal");
  });
});
