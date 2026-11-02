import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { legalTextHash, currentLegalTexts, type RegisteredText } from "@/lib/legal/text-hash";
import { PACKAGE_VISIT_WINDOWS } from "@/lib/billing/installments";
import { VISIT_WINDOWS } from "@/lib/billing/visit-windows";
import { registerLegalText } from "../local-db";
import {
  CONSENTS,
  activeOrderFor,
  addDays,
  check,
  createCustomer,
  istanbulToday,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { SEED, anonClient, serviceClient, signIn } from "./fixtures";

// Legal follow-ups of wave 1 against the local stack (docs/hukuk/kararlar.md
// T21, T04, T03, T18; docs/musteri-yonetimi.md §9, "Sözleşme belgeleri (T04)").

const DOMAIN = "legal-followups.example.test";
const admin = serviceClient();

let customer: TestCustomer;

beforeAll(async () => {
  await removeCustomers(DOMAIN);
  customer = await createCustomer(DOMAIN);
});

afterAll(async () => {
  await removeCustomers(DOMAIN);
});

describe("legal-text registry (T21)", () => {
  // A text change or a version bump without a registry migration fails here.
  it("holds the web's current versions with the helper's template hashes", async () => {
    const rows = check(await anonClient().rpc("registered_legal_text_versions"));
    const current = Object.fromEntries(
      rows
        .filter((r) => r.is_current)
        .map((r) => [r.kind, { version: r.version, sha256: r.sha256 }]),
    );
    expect(current).toEqual(currentLegalTexts());
    for (const kind of Object.keys(current) as RegisteredText[]) {
      expect(current[kind].sha256).toBe(legalTextHash(kind));
    }
  });

  it("keeps the archived versions without a hash", async () => {
    const rows = check(await anonClient().rpc("registered_legal_text_versions"));
    const archived = rows.filter((r) => !r.is_current);
    expect(archived.map((r) => r.version).sort()).toEqual([
      "bakim-v1-taslak",
      "gizlilik-v1-taslak",
      "iade-v1-taslak",
      "iade-v2-taslak",
      "iade-v3-taslak",
      "iade-v4-taslak",
      "kvkk-v1-taslak",
      "mesafeli-v1-taslak",
      "mesafeli-v2-taslak",
      "mesafeli-v3-taslak",
      "mesafeli-v4-taslak",
      "mesafeli-v4-taslak",
      "onbilgi-v1-taslak",
      "onbilgi-v2-taslak",
      "onbilgi-v3-taslak",
      "onbilgi-v4-taslak",
      "riza-v1-taslak",
    ]);
    expect(archived.every((r) => r.sha256 === null && !r.is_final)).toBe(true);
  });

  it("publishes the seller's company information to anyone", async () => {
    const info = check(await anonClient().rpc("public_company_info"))[0];
    expect(info).toMatchObject({
      legal_name: "orchadOS Denetim Hizmetleri A.Ş. (örnek)",
      site_domain: "orchados.example",
      kvkk_email: "kvkk@orchados.example",
      complete: true,
    });
  });

  it("mirrors the contract visit windows (T18)", async () => {
    const rows = check(await anonClient().rpc("contract_visit_windows"));
    expect(
      rows.map((r) => ({
        code: r.code,
        name: r.name,
        startMonth: r.start_month,
        endMonth: r.end_month,
      })),
    ).toEqual(VISIT_WINDOWS.map((w) => ({ ...w })));
  });

  it("mirrors the package visit windows of the payment plan (H35, Ek-2 v5)", async () => {
    for (const visits of [2, 4, 6]) {
      const rows = check(
        await anonClient().rpc("package_visit_windows", { p_year_visits: visits }),
      );
      expect(
        rows.map((r) => ({
          code: r.code,
          start: [r.start_month, r.start_day],
          end: [r.end_month, r.end_day],
        })),
      ).toEqual(
        PACKAGE_VISIT_WINDOWS.filter((w) => w.packages.some((p) => p === visits)).map((w) => ({
          code: w.code,
          start: [...w.start],
          end: [...w.end],
        })),
      );
    }
  });
});

describe("production gate and the KVKK re-acknowledgement (T21)", () => {
  const LAUNCH: [RegisteredText, string][] = [
    ["distance_sales", "mesafeli-v4"],
    ["pre_information", "onbilgi-v4"],
    ["kvkk_notice", "kvkk-v2"],
  ];

  const setGate = async (on: boolean) =>
    check(
      await admin
        .from("org_billing_setting")
        .update({ legal_gate_enforced: on })
        .eq("org_id", SEED.org)
        .select("org_id"),
    );

  afterAll(async () => {
    await setGate(false);
    for (const [kind] of LAUNCH) {
      const draft = currentLegalTexts()[kind];
      await registerLegalText(kind, draft.version, draft.sha256);
    }
  });

  it("refuses acceptance until the texts are final and the notice is re-acknowledged", async () => {
    const { quote } = await quoteFor(customer);
    await setGate(true);
    const c = customer.client;

    // Drafts: the gate names every reason; the old web's string form fails.
    const gate = check(await c.rpc("legal_gate_status", { p_org_id: SEED.org }))[0];
    expect(gate).toEqual({
      active: true,
      reasons: ["distance_sales_draft", "pre_information_draft", "kvkk_notice_not_final"],
    });
    const drafts = await c.rpc("customer_accept_quote", {
      p_quote_id: quote,
      p_consents: CONSENTS,
    });
    expect(drafts.error).toMatchObject({
      message: "legal_texts_not_final",
      details: "distance_sales_draft",
    });

    // Launch: final versions registered (a registry migration on real projects).
    for (const [kind, version] of LAUNCH) await registerLegalText(kind, version, "0".repeat(64));
    const final = { distance_sales: "mesafeli-v4", pre_information: "onbilgi-v4" };
    const stale = await c.rpc("customer_accept_quote", { p_quote_id: quote, p_consents: CONSENTS });
    expect(stale.error).toMatchObject({
      message: "legal_text_outdated",
      details: "distance_sales",
    });
    const notice = await c.rpc("customer_accept_quote", { p_quote_id: quote, p_consents: final });
    expect(notice.error).toMatchObject({
      message: "legal_texts_not_final",
      details: "kvkk_notice_not_final",
    });

    // The quote page offers the acknowledgement of the current notice.
    check(
      await c.rpc("customer_set_consent", {
        p_kind: "kvkk_notice",
        p_granted: true,
        p_text_version: "kvkk-v2",
      }),
    );
    expect(check(await c.rpc("legal_gate_status", { p_org_id: SEED.org }))[0].reasons).toEqual([]);
    const order = check(
      await c.rpc("customer_accept_quote", { p_quote_id: quote, p_consents: final }),
    );
    expect(order).toBeTruthy();
  });
});

describe("contract documents (T04)", () => {
  it("stores a PDF once, immutably, and lists it for the customer", async () => {
    const { order } = await quoteFor(customer).then(async ({ quote }) => ({
      order: check(
        await customer.client.rpc("customer_accept_quote", {
          p_quote_id: quote,
          p_consents: CONSENTS,
        }),
      ),
    }));
    const row = check(await admin.from("service_order").select("org_id").eq("id", order).single());
    const pdf = Buffer.from("%PDF-1.4\n% test\n");
    const bucket = admin.storage.from("contract-documents");
    for (const kind of ["pre_information", "distance_sales"] as const) {
      const path = `${row.org_id}/${order}/${kind}.pdf`;
      const upload = await bucket.upload(path, pdf, { contentType: "application/pdf" });
      expect(upload.error).toBeNull();
      const texts = currentLegalTexts();
      check(
        await admin.rpc("service_register_contract_document", {
          p_order_id: order,
          p_kind: kind,
          p_text_version: texts[kind].version,
          p_text_sha256: texts[kind].sha256,
          p_storage_path: path,
          p_sha256: "a".repeat(64),
          p_size_bytes: pdf.length,
          p_generator: "integration-test",
        }),
      );
      // Immutable through the Storage API too, even for the service role.
      const upsert = await bucket.upload(path, Buffer.from("%PDF-1.4\n% other\n"), {
        contentType: "application/pdf",
        upsert: true,
      });
      expect(upsert.error).not.toBeNull();
      const removed = await bucket.remove([path]);
      expect(removed.error ?? removed.data?.length === 0).toBeTruthy();
      const still = await bucket.download(path);
      expect(await still.data?.text()).toBe(pdf.toString());
    }

    const docs = check(await customer.client.rpc("my_contract_documents"));
    expect(docs.map((d) => d.kind).sort()).toEqual(["distance_sales", "pre_information"]);
    const download = await customer.client.storage
      .from("contract-documents")
      .download(docs[0].storage_path);
    expect(download.error).toBeNull();
    const sms = check(
      await admin
        .from("notification")
        .select("template")
        .eq("ref_id", order)
        .eq("template", "contract_ready"),
    );
    expect(sms).toHaveLength(1);

    // Customers never register documents.
    const denied = await customer.client.rpc("service_register_contract_document", {
      p_order_id: order,
      p_kind: "distance_sales",
      p_text_version: "x",
      p_text_sha256: "x",
      p_storage_path: "x",
      p_sha256: "x",
      p_size_bytes: 1,
      p_generator: "x",
    });
    expect(denied.error?.code).toBe("42501");
  });
});

describe("planning inside the withdrawal period (T03)", () => {
  it("refuses ops planning without the box but lets a field status update sync", async () => {
    const { parcels } = await activeOrderFor(customer);
    const parcel = parcels[0];
    const { client: ops } = await signIn("ops");
    const planned = await ops.from("session").insert({
      org_id: SEED.org,
      parcel_id: parcel,
      kind: "inventory",
      status: "planned",
      planned_date: addDays(istanbulToday(), 3),
    });
    expect(planned.error?.message).toBe("withdrawal_period_open");

    // A visit planned before (here by the service role) still syncs from the
    // field app: planned → captured as the field user through PostgREST.
    const { client: field, userId: fieldId } = await signIn("field");
    const session = check(
      await admin
        .from("session")
        .insert({
          org_id: SEED.org,
          parcel_id: parcel,
          kind: "inventory",
          status: "planned",
          planned_date: addDays(istanbulToday(), 1),
          lead_user_id: fieldId,
        })
        .select("id")
        .single(),
    ).id;
    const synced = await field
      .from("session")
      .update({ status: "captured", started_at: new Date().toISOString() })
      .eq("id", session)
      .in("status", ["planned"])
      .select("id");
    expect(synced.error).toBeNull();
    expect(synced.data).toHaveLength(1);
  });
});

// An issued (still open) quote for one new garden of the customer.
async function quoteFor(c: TestCustomer): Promise<{ quote: string }> {
  const { client: ops } = await signIn("ops");
  const app = check(
    await c.client.rpc("customer_create_application", {
      p_package_id: "91200000-0000-4000-8000-000000000001",
    }),
  );
  const offset = Math.random() * 0.05;
  const garden = check(
    await c.client.rpc("customer_save_application_garden", {
      p_application_id: app,
      p_garden: { name: "Hukuk bahçesi", declared_area_m2: 20000, lon: 37.9 + offset, lat: 37.1 },
      p_detail: { authorization_basis: "title_holder", entry_permission: true },
    }),
  );
  check(await c.client.rpc("customer_submit_application", { p_application_id: app }));
  check(
    await ops.rpc("ops_verify_application_garden", {
      p_garden_id: garden,
      p_verified_area_m2: 20000,
    }),
  );
  return { quote: check(await ops.rpc("ops_issue_quote", { p_application_id: app })) };
}
