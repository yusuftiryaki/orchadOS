import { execFileSync } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import {
  admin,
  anon,
  istanbulToday,
  PASSWORD,
  removeJourneyUsers,
  SEED_ORG,
  STANDART,
} from "../e2e/billing-helpers";

// Synthetic customers of the operations chapters (docs/kilavuz/02–04): each
// state is made through the app's own functions, as the customer and as
// ops@ would. Every account is under DOMAIN; buildOpsFixture() first removes
// the previous run's rows (accounts, billing rows, parcels), so the state
// after a run stays inspectable.

export const DOMAIN = "kilavuz-ops.example.test";

type Db = SupabaseClient<Database>;

function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

async function signIn(email: string): Promise<{ client: Db; userId: string }> {
  const client = anon();
  const result = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (result.error) throw result.error;
  return { client, userId: result.data.user.id };
}

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Runs one statement as the local database's owner; false when it fails.
function asOwner(statement: string): boolean {
  try {
    execFileSync("psql", [LOCAL_DB, "-v", "ON_ERROR_STOP=1", "-c", statement], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const uuid = (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`not a uuid: ${id}`);
  return id;
};

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// A square boundary of about `side` metres around [lon, lat].
function square(lon: number, lat: number, side: number): [number, number][] {
  const dLat = side / 2 / 111_000;
  const dLon = side / 2 / (111_000 * Math.cos((lat * Math.PI) / 180));
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
  ];
}

interface Garden {
  name: string;
  m2: number;
  lon: number;
  lat: number;
}

// A customer who signed up: account, owner profile with the KVKK notice
// (recorded by ops and read in the portal), billing profile.
async function customer(ops: Db, key: string, name: string, phone: string) {
  const email = `${key}@${DOMAIN}`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    phone: phone.slice(1),
    phone_confirm: true,
  });
  if (created.error) throw created.error;
  check(
    await ops.rpc("ops_create_owner_profile", {
      p_org_id: SEED_ORG,
      p_user_id: created.data.user.id,
      p_full_name: name,
      p_contact_preference: "sms",
      p_kvkk_consent: true,
      p_phone: phone,
      p_email: email,
      p_kvkk_consent_at: new Date().toISOString(),
      p_kvkk_text_version: "kvkk-v2-taslak",
    }),
  );
  const { client, userId } = await signIn(email);
  check(
    await client.rpc("customer_set_consent", {
      p_kind: "kvkk_notice",
      p_granted: true,
      p_text_version: "kvkk-v2-taslak",
    }),
  );
  const [first, ...rest] = name.split(" ");
  check(
    await client.rpc("customer_save_billing_profile", {
      p_profile: {
        kind: "individual",
        first_name: first,
        last_name: rest.join(" "),
        address: "Deneme Mah. 1. Sok. No: 2",
        district: "Nizip",
        city: "Gaziantep",
        postal_code: "27700",
      },
    }),
  );
  return { client, userId, email };
}

// A submitted application with these gardens (Standart package).
async function apply(client: Db, gardens: Garden[], note?: string) {
  const id = check(await client.rpc("customer_create_application", { p_package_id: STANDART }));
  for (const g of gardens) {
    check(
      await client.rpc("customer_save_application_garden", {
        p_application_id: id,
        p_garden: {
          name: g.name,
          province: "Gaziantep",
          district: "Nizip",
          village: "Deneme Köyü",
          declared_area_m2: g.m2,
          irrigation: "rainfed",
          estimated_tree_count: Math.round(g.m2 / 70),
          lon: g.lon,
          lat: g.lat,
          position_uncertainty_m: 30,
          boundary: square(g.lon, g.lat, Math.sqrt(g.m2)),
        },
        p_detail: {
          authorization_basis: "title_holder",
          deed_block: "101",
          deed_parcel: "7",
          is_shared_deed: false,
          entry_permission: true,
          access_note: "Kapı köy yolunda; anahtar bekçide.",
        },
      }),
    );
  }
  if (note) {
    check(
      await client.rpc("customer_set_application_package", {
        p_application_id: id,
        p_package_id: STANDART,
        p_customer_note: note,
      }),
    );
  }
  check(await client.rpc("customer_submit_application", { p_application_id: id }));
  return id;
}

async function gardensOf(applicationId: string) {
  return check(
    await admin
      .from("application_garden")
      .select("id, name, declared_area_m2")
      .eq("application_id", applicationId)
      .order("name"),
  );
}

async function verifyAll(ops: Db, applicationId: string, only?: string) {
  for (const g of await gardensOf(applicationId)) {
    if (only && g.name !== only) continue;
    check(
      await ops.rpc("ops_verify_application_garden", {
        p_garden_id: g.id,
        p_verified_area_m2: Number(g.declared_area_m2) - 500,
        p_note: "Uydu görüntüsünden ölçüldü; sınır beyanla uyumlu.",
      }),
    );
  }
}

const CONSENTS = { distance_sales: "mesafeli-v5-taslak", pre_information: "onbilgi-v5-taslak" };

export interface OpsFixture {
  // In review, two gardens: "Deneme Bahçesi Kuzey" verified, "Güney" not.
  reviewApp: string;
  reviewGardens: { verified: string; open: string };
  // In review, its only garden verified: the quote preview shows.
  readyApp: string;
  // Quoted with a neighbour discount.
  quotedApp: string;
  quoteId: string;
  // Active order with its payment plan: the inventory payment paid by a
  // recorded transfer, the visit payments open (one 40 days past due).
  activeOrder: string;
  activePayment: string;
  activeParcel: string;
  activeProfile: string;
  overdueSet: boolean;
  // The active member's second application (an add-on garden next to the
  // first one: the duplicate check lists it).
  addonApp: string;
  // Quote accepted, nothing paid yet.
  awaitingOrder: string;
}

export async function buildOpsFixture(): Promise<OpsFixture> {
  await removeJourneyUsers(DOMAIN);
  const ops = (await signIn("ops@example.com")).client;
  const today = istanbulToday();

  // 1. In review, one garden verified.
  const a = await customer(ops, "musteri-bir", "Örnek Müşteri Bir", "+905550000011");
  const reviewApp = await apply(
    a.client,
    [
      { name: "Deneme Bahçesi Kuzey", m2: 21000, lon: 37.552, lat: 37.061 },
      { name: "Deneme Bahçesi Güney", m2: 12000, lon: 37.553, lat: 37.057 },
    ],
    "Bahçeler yan yana değil; aradan köy yolu geçiyor.",
  );
  await verifyAll(ops, reviewApp, "Deneme Bahçesi Kuzey");
  const ag = await gardensOf(reviewApp);
  const reviewGardens = {
    verified: ag.find((g) => g.name === "Deneme Bahçesi Kuzey")!.id,
    open: ag.find((g) => g.name === "Deneme Bahçesi Güney")!.id,
  };

  // 2. In review, ready for a quote.
  const b = await customer(ops, "musteri-iki", "Örnek Müşteri İki", "+905550000012");
  const readyApp = await apply(b.client, [
    { name: "Deneme Bahçesi Tepe", m2: 15000, lon: 37.571, lat: 37.071 },
  ]);
  await verifyAll(ops, readyApp);

  // 3. Quoted, with the neighbour discount.
  const c = await customer(ops, "musteri-uc", "Örnek Müşteri Üç", "+905550000013");
  const quotedApp = await apply(c.client, [
    { name: "Deneme Bahçesi Pınar", m2: 25000, lon: 37.581, lat: 37.081 },
  ]);
  await verifyAll(ops, quotedApp);
  const quoteId = check(
    await ops.rpc("ops_issue_quote", {
      p_application_id: quotedApp,
      p_discount_bp: 1000,
      p_discount_note: "Komşu bahçe indirimi, Deneme Köyü",
      p_note_to_customer: "Envanter ziyaretini mart başında planlıyoruz.",
    }),
  );

  // 4. Active order: inventory payment by transfer, visit payments open.
  const d = await customer(ops, "musteri-dort", "Örnek Müşteri Dört", "+905550000014");
  const dApp = await apply(d.client, [
    { name: "Deneme Bahçesi Dere", m2: 18000, lon: 37.591, lat: 37.091 },
  ]);
  await verifyAll(ops, dApp);
  const dQuote = check(await ops.rpc("ops_issue_quote", { p_application_id: dApp }));
  const activeOrder = check(
    await d.client.rpc("customer_accept_quote", { p_quote_id: dQuote, p_consents: CONSENTS }),
  );
  const plan = check(
    await admin
      .from("order_installment")
      .select("id, seq, amount_kurus")
      .eq("order_id", activeOrder)
      .order("seq"),
  );
  const activePayment = check(
    await ops.rpc("ops_record_manual_payment", {
      p_order_id: activeOrder,
      p_installment_id: plan[0].id,
      p_amount_kurus: plan[0].amount_kurus,
      p_value_date: today,
      p_bank_reference: "EFT-KILAVUZ-0001",
      p_note: "Dekont e-postayla geldi.",
    }),
  );
  // A visit payment 40 days past its due day (the overdue list). No app
  // path moves a due day back and the table refuses API writes, so the
  // local database's owner does it (psql; skipped when psql is missing).
  const late = plan.find((p) => p.seq === 3) ?? plan[plan.length - 1];
  const overdueSet = asOwner(
    `update public.order_installment set due_on = '${addDays(today, -40)}' where id = '${uuid(late.id)}'`,
  );
  const activeParcel = check(
    await admin
      .from("service_order_item")
      .select("parcel_id")
      .eq("order_id", activeOrder)
      .order("line_no")
      .limit(1)
      .single(),
  ).parcel_id as string;
  const activeProfile = check(
    await ops.rpc("ops_customers", { p_org_id: SEED_ORG, p_query: "Örnek Müşteri Dört" }),
  );
  // A co-owner invitation from the portal (dashboard, "Hissedar davetleri").
  check(
    await d.client.rpc("owner_invite_viewer", {
      p_parcel_id: activeParcel,
      p_full_name: "Örnek Hissedar",
      p_phone: "+905550000091",
      p_declared: true,
    }),
  );
  // An add-on garden 150 m from the first one.
  const addonApp = await apply(d.client, [
    { name: "Deneme Bahçesi Dere Ek", m2: 9000, lon: 37.5927, lat: 37.091 },
  ]);
  await verifyAll(ops, addonApp);

  // 5. Accepted, awaiting payment.
  const e = await customer(ops, "musteri-bes", "Örnek Müşteri Beş", "+905550000015");
  const eApp = await apply(e.client, [
    { name: "Deneme Bahçesi Çınar", m2: 11000, lon: 37.601, lat: 37.101 },
  ]);
  await verifyAll(ops, eApp);
  const eQuote = check(await ops.rpc("ops_issue_quote", { p_application_id: eApp }));
  const awaitingOrder = check(
    await e.client.rpc("customer_accept_quote", { p_quote_id: eQuote, p_consents: CONSENTS }),
  );
  // Its payment time ran out two days ago ("Süresi geçen ödeme").
  asOwner(
    `update public.service_order set payment_due_at = now() - interval '2 days' where id = '${uuid(awaitingOrder)}'`,
  );

  const profile = activeProfile.find((p) => p.user_id === d.userId);
  return {
    reviewApp,
    reviewGardens,
    readyApp,
    quotedApp,
    quoteId,
    activeOrder,
    activePayment,
    activeParcel,
    activeProfile: profile?.profile_id ?? "",
    overdueSet,
    addonApp,
    awaitingOrder,
  };
}

// Full-page shots: the sticky app header would be painted again halfway
// down the image; it scrolls with the page instead.
export async function unstick(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: "header, [class*='header'] { position: static !important; }",
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}
