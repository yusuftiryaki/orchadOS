import { createHash, randomUUID } from "node:crypto";
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
import { resolveSupabaseEnv } from "../local-supabase";

// Synthetic states of the guide chapters 05 (visits) and 08 (refunds,
// removals, reconciliation, KVKK, notifications). Customers are made through
// the app's own functions, as the customer, ops@ and field@ would; the few
// rows only a background job or the payment provider writes are noted where
// they are made. Each builder first removes its previous run (accounts under
// its domain, their billing rows and parcels), so the state stays inspectable
// after the run.

type Db = SupabaseClient<Database>;

export function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

export async function signIn(email: string): Promise<{ client: Db; userId: string }> {
  const client = anon();
  const result = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (result.error) throw result.error;
  return { client, userId: result.data.user.id };
}

export const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// A customer who signed up: account, owner profile with the KVKK notice,
// billing profile.
async function customer(ops: Db, domain: string, key: string, name: string, phone: string) {
  const email = `${key}@${domain}`;
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

type Customer = Awaited<ReturnType<typeof customer>>;

interface MemberOptions {
  // The customer asked for an early start at acceptance (no withdrawal wait).
  early?: boolean;
  // "all": every payment of the plan by recorded transfers; "first": only
  // the first one; "card": the first one by the fake card checkout.
  pay?: "all" | "first" | "card" | "none";
}

// An application with one garden, verified and quoted by ops, accepted by
// the customer and paid as asked. Returns the order and its parcel.
async function member(
  ops: Db,
  c: Customer,
  garden: { name: string; lon: number; lat: number },
  opts: MemberOptions = {},
): Promise<{ orderId: string; parcelId: string; itemId: string }> {
  const app = check(await c.client.rpc("customer_create_application", { p_package_id: STANDART }));
  check(
    await c.client.rpc("customer_save_application_garden", {
      p_application_id: app,
      p_garden: {
        name: garden.name,
        province: "Gaziantep",
        district: "Nizip",
        village: "Deneme Köyü",
        declared_area_m2: 15000,
        irrigation: "rainfed",
        estimated_tree_count: 210,
        lon: garden.lon,
        lat: garden.lat,
      },
      p_detail: { entry_permission: true, authorization_basis: "title_holder" },
    }),
  );
  check(await c.client.rpc("customer_submit_application", { p_application_id: app }));
  const gardens = check(
    await admin.from("application_garden").select("id, declared_area_m2").eq("application_id", app),
  );
  for (const g of gardens) {
    check(
      await ops.rpc("ops_verify_application_garden", {
        p_garden_id: g.id,
        p_verified_area_m2: Number(g.declared_area_m2),
      }),
    );
  }
  const quote = check(await ops.rpc("ops_issue_quote", { p_application_id: app }));
  const consents: Record<string, string> = {
    distance_sales: "mesafeli-v5-taslak",
    pre_information: "onbilgi-v5-taslak",
  };
  if (opts.early) consents.early_performance = "mesafeli-v5-taslak";
  const orderId = check(
    await c.client.rpc("customer_accept_quote", { p_quote_id: quote, p_consents: consents }),
  );
  const pay = opts.pay ?? "all";
  if (pay === "all" || pay === "first") {
    const plan = check(
      await admin
        .from("order_installment")
        .select("id, seq, amount_kurus")
        .eq("order_id", orderId)
        .order("seq"),
    );
    for (const i of pay === "all" ? plan : plan.slice(0, 1)) {
      check(
        await ops.rpc("ops_record_manual_payment", {
          p_order_id: orderId,
          p_installment_id: i.id,
          p_amount_kurus: i.amount_kurus,
          p_value_date: istanbulToday(),
          p_bank_reference: `EFT-KILAVUZ-${orderId.slice(0, 4)}-${i.seq}`,
        }),
      );
    }
  } else if (pay === "card") {
    await payByCard(c.client, orderId);
  }
  const item = check(
    await admin
      .from("service_order_item")
      .select("id, parcel_id")
      .eq("order_id", orderId)
      .order("line_no")
      .limit(1)
      .single(),
  );
  return { orderId, parcelId: item.parcel_id as string, itemId: item.id };
}

// The customer pays the next payment of the order by card: the payments
// function starts a fake checkout, and the fake provider's callback approves
// it (what the "Onayla" button of /odeme/sahte posts).
async function payByCard(client: Db, orderId: string) {
  const env = resolveSupabaseEnv();
  const session = (await client.auth.getSession()).data.session;
  if (!session) throw new Error("no session");
  const started = await fetch(`${env.url}/functions/v1/payments`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      apikey: env.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "start",
      order_id: orderId,
      return_origin: "http://127.0.0.1:3000",
      client_ip: "127.0.0.1",
    }),
  });
  const body = (await started.json()) as { payment_id?: string; redirect_url?: string };
  if (!started.ok || !body.redirect_url) {
    throw new Error(`payment start: ${started.status} ${JSON.stringify(body)}`);
  }
  const token = new URL(body.redirect_url).searchParams.get("token");
  if (!token) throw new Error("no fake token");
  const callback = await fetch(`${env.url}/functions/v1/payment-callback`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, outcome: "success" }).toString(),
    redirect: "manual",
  });
  if (callback.status >= 400) throw new Error(`payment callback: ${callback.status}`);
  for (let i = 0; i < 30; i++) {
    const p = check(
      await admin.from("payment").select("status").eq("id", body.payment_id!).single(),
    );
    if (p.status === "succeeded") return body.payment_id!;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("card payment did not succeed");
}

// A 1×1 PNG: the synthetic "blocked gate" photo of the field app.
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// ---------------------------------------------------------------------------
// Chapter 05: visits
// ---------------------------------------------------------------------------

export const VISIT_DOMAIN = "kilavuz-ziyaret.example.test";

export interface VisitFixture {
  // Paid, early start: visits can be planned.
  parcelId: string;
  parcelName: string;
  // No early start: the withdrawal period refuses periodic visits.
  waitingParcelName: string;
  // Planned for today; the field app recorded "Ziyaret yapılamadı".
  blockedVisit: string;
  // Planned in December; the owner asked by phone to postpone it.
  postponedVisit: string;
  // A visit the spec plans in the browser goes on this day (>= 3 days).
  farDay: string;
  // ... and this one closer (phone notice).
  nearDay: string;
  // Inside the 14-day withdrawal period of the waiting parcel.
  withdrawalDay: string;
}

export async function buildVisitFixture(): Promise<VisitFixture> {
  await removeJourneyUsers(VISIT_DOMAIN);
  const ops = (await signIn("ops@example.com")).client;
  const field = await signIn("field@example.com");
  const today = istanbulToday();

  const a = await customer(
    ops,
    VISIT_DOMAIN,
    "sahip-ziyaret",
    "Örnek Sahip Ziyaret",
    "+905550000031",
  );
  const parcelName = "Deneme Bahçesi Ziyaret";
  const m = await member(ops, a, { name: parcelName, lon: 37.62, lat: 37.12 }, { early: true });

  const b = await customer(ops, VISIT_DOMAIN, "sahip-cayma", "Örnek Sahip Cayma", "+905550000032");
  const waitingParcelName = "Deneme Bahçesi Cayma";
  await member(ops, b, { name: waitingParcelName, lon: 37.64, lat: 37.13 });

  // A visit planned for today (the phone notice recorded with it), where the
  // crew found the gate locked: the field app's visit_blocked event with its
  // photo, and the sign, verbal-notice and objection records.
  const blockedVisit = check(
    await ops
      .from("session")
      .insert({
        org_id: SEED_ORG,
        parcel_id: m.parcelId,
        kind: "periodic_scan",
        status: "planned",
        performer: "crew",
        planned_date: today,
        lead_user_id: field.userId,
        notes: "Bekçi sabah 9'da kapıda olacak.",
      })
      .select("id")
      .single(),
  ).id;
  check(
    await ops.rpc("ops_record_visit_phone_notice", {
      p_session_id: blockedVisit,
      p_notified_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
    }),
  );
  const eventId = randomUUID();
  const now = new Date();
  const event = (id: string, type: string, payload: Record<string, unknown>, minutes: number) => ({
    id,
    org_id: SEED_ORG,
    parcel_id: m.parcelId,
    session_id: blockedVisit,
    event_type: type,
    payload: JSON.stringify(payload),
    gps_time_ns: (now.getTime() - minutes * 60_000) * 1_000_000,
    time_source: "phone",
    phone_time: new Date(now.getTime() - minutes * 60_000).toISOString(),
    logger_result: "none",
  });
  check(
    await field.client.from("session_event").insert([
      event(randomUUID(), "field_notice_sign", { sign: true, badge: true }, 50),
      event(
        randomUUID(),
        "field_notice_verbal",
        { answer: "given", note: "Komşu bahçedeki işçi" },
        45,
      ),
      event(
        randomUUID(),
        "field_notice_objection",
        { note: "İşçi görüntüye girmek istemedi." },
        44,
      ),
      event(
        eventId,
        "visit_blocked",
        {
          reason: "customer",
          detail: "gate_closed",
          note: "Kapı kilitli, bekçi gelmedi.",
          photo_count: 1,
        },
        40,
      ),
    ] as never),
  );
  // A unique file per run (the PNG with the visit id appended).
  const photo = Buffer.concat([PHOTO, Buffer.from(blockedVisit)]);
  const realSha = createHash("sha256").update(photo).digest("hex");
  const realPath = `org/${SEED_ORG}/parcel/${m.parcelId}/${realSha}`;
  await field.client.storage.from("media").upload(realPath, photo, {
    contentType: "image/png",
    upsert: false,
  });
  check(
    await field.client.from("capture").insert({
      id: randomUUID(),
      org_id: SEED_ORG,
      parcel_id: m.parcelId,
      session_id: blockedVisit,
      kind: "photo",
      uri: `storage://media/${realPath}`,
      content_hash: realSha,
      byte_size: photo.length,
      mime_type: "image/png",
      started_at: new Date(now.getTime() - 40 * 60_000).toISOString(),
      metadata: {
        source: "field_app",
        local_kind: "blocked_visit_photo",
        event_id: eventId,
        time_source: "phone",
      },
    } as never),
  );
  // An earlier attempt the same morning, kept without an outcome yet.
  check(
    await ops.rpc("ops_record_missed_visit", {
      p_session_id: blockedVisit,
      p_reason: "weather",
      p_occurred_on: today,
      p_detail: "rain",
      p_note: "Sabah yağmur; ekip öğleden sonra yeniden denedi.",
    } as never),
  );

  // A December visit the owner asked by phone to postpone.
  const postponedVisit = check(
    await ops
      .from("session")
      .insert({
        org_id: SEED_ORG,
        parcel_id: m.parcelId,
        kind: "periodic_scan",
        status: "planned",
        performer: "crew",
        planned_date: addDays(today, 47),
        lead_user_id: field.userId,
      })
      .select("id")
      .single(),
  ).id;
  check(
    await ops.rpc("ops_record_visit_postponement", {
      p_session_id: postponedVisit,
      p_channel: "phone",
      p_requested_at: new Date(Date.now() - 3600_000).toISOString(),
    }),
  );

  return {
    parcelId: m.parcelId,
    parcelName,
    waitingParcelName,
    blockedVisit,
    postponedVisit,
    farDay: addDays(today, 40),
    nearDay: addDays(today, 1),
    withdrawalDay: addDays(today, 6),
  };
}

// ---------------------------------------------------------------------------
// Chapter 08: refunds, garden removals, reconciliation, KVKK, notifications
// ---------------------------------------------------------------------------

export const REFUND_DOMAIN = "kilavuz-iade.example.test";

export interface RefundFixture {
  // Asked by the customer, 30 days' notice.
  requestedRemoval: string;
  // Opened by ops (transfer) 5 days from today.
  scheduledRemoval: string;
  // Due today, stopped by a renewal order with money on it.
  blockedRemoval: string | null;
  // Completed today ("Hemen"), its transfer refund requested by the system.
  completedRemoval: string;
  customerName: string;
}

const PREFIX = "Örnek Sahip";

// A function returning one id or a list of ids: the first id.
const one = (v: unknown): string => (Array.isArray(v) ? String(v[0]) : String(v));

export async function buildRefundFixture(): Promise<RefundFixture> {
  await removeJourneyUsers(REFUND_DOMAIN);
  const ops = (await signIn("ops@example.com")).client;
  const today = istanbulToday();
  const mk = (key: string, name: string, phone: string) =>
    customer(ops, REFUND_DOMAIN, key, `${PREFIX} ${name}`, phone);

  // 1. Asked by the customer in the portal: "30 gün sonra".
  const c1 = await mk("sahip-talep", "Talep", "+905550000041");
  const m1 = await member(
    ops,
    c1,
    { name: "Deneme Bahçesi Talep", lon: 37.66, lat: 37.14 },
    {
      early: true,
    },
  );
  const requestedRemoval = one(
    check(
      await c1.client.rpc("customer_request_garden_removal", {
        p_parcel_id: m1.parcelId,
        p_reason: "sold",
        p_timing: "notice",
        p_note: "Bahçeyi komşuma sattım, tapu devri kasımda.",
      }),
    ),
  );
  // KVKK applications from the portal form (on in the local seed).
  check(
    await c1.client.rpc("portal_file_kvkk_request", {
      p_type: "access",
      p_message: "Hakkımda hangi bilgileri tuttuğunuzu öğrenmek istiyorum.",
    }),
  );
  const erasure = check(
    await c1.client.rpc("portal_file_kvkk_request", {
      p_type: "erasure",
      p_message: "Bahçeyi sattım; eski bahçemin görüntülerinde görünüyorsam silinmesini istiyorum.",
    }),
  );
  check(
    await ops.rpc("ops_set_kvkk_request_status", {
      p_request_id: one(erasure),
      p_status: "in_progress",
    }),
  );

  // 2. Opened by ops: the garden was handed to a new owner (transfer) in
  // 5 days, by agreement and without access afterwards.
  const c2 = await mk("sahip-devir", "Devir", "+905550000042");
  const m2 = await member(
    ops,
    c2,
    { name: "Deneme Bahçesi Devir", lon: 37.68, lat: 37.15 },
    {
      early: true,
    },
  );
  const scheduledRemoval = one(
    check(
      await ops.rpc("ops_request_garden_removal", {
        p_order_item_id: m2.itemId,
        p_reason: "transfer",
        p_effective_on: addDays(today, 5),
        p_note: "Tapu devri 3 Kasım'da; yeni sahip ayrıca başvuracak.",
        p_access_days: 0,
        p_owner_consent_note: "Sahip 28 Ekim'de e-postayla yazılı onay verdi.",
      }),
    ),
  );

  // 3. Blocked: a renewal of the garden accepted and partly paid, and a
  // removal due today. The request checks refuse this order of events, so
  // the removal row is written as if it raced the renewal (as the database
  // test of the blocked state does); the daily job then marks it blocked.
  const c3 = await mk("sahip-engel", "Engel", "+905550000043");
  const m3 = await member(
    ops,
    c3,
    { name: "Deneme Bahçesi Engel", lon: 37.7, lat: 37.16 },
    {
      early: true,
    },
  );
  let blockedRemoval: string | null = null;
  try {
    await setPeriod(m3.orderId, addDays(today, -300), addDays(today, 64));
    const renewal = check(
      await ops.rpc("ops_issue_parcel_quote", {
        p_org_id: SEED_ORG,
        p_customer_user_id: c3.userId,
        p_package_id: STANDART,
        p_parcel_ids: [m3.parcelId],
        p_first_year: false,
        p_proposed_service_start: null,
        p_renewal_of_order_id: m3.orderId,
        p_valid_days: null,
        p_discount_bp: null,
        p_discount_note: null,
        p_note_to_customer: null,
      } as never),
    );
    const renewalOrder = check(
      await c3.client.rpc("customer_accept_quote", {
        p_quote_id: one(renewal),
        p_consents: {
          distance_sales: "mesafeli-v5-taslak",
          pre_information: "onbilgi-v5-taslak",
          early_performance: "mesafeli-v5-taslak",
        },
      }),
    );
    check(
      await ops.rpc("ops_record_manual_payment", {
        p_order_id: one(renewalOrder),
        p_amount_kurus: 100000,
        p_value_date: today,
        p_bank_reference: "EFT-KILAVUZ-YENILEME",
      }),
    );
    const item = check(
      await admin
        .from("service_order_item")
        .select("id, parcel_id, order_id, garden_name")
        .eq("id", m3.itemId)
        .single(),
    );
    blockedRemoval = check(
      await admin
        .from("garden_removal")
        .insert({
          org_id: SEED_ORG,
          customer_user_id: c3.userId,
          number: `C-2026-9${String(Date.now()).slice(-5)}`,
          parcel_id: item.parcel_id,
          order_id: item.order_id,
          order_item_id: item.id,
          garden_name: item.garden_name,
          status: "requested",
          initiated_by: "customer",
          reason: "sold",
          requested_effective_on: today,
          access_days: 90,
        } as never)
        .select("id")
        .single(),
    ).id as string;
  } catch (error) {
    console.warn("blocked removal not made:", error);
  }

  // 4. "Dönem sonunda": the period ended yesterday (moved by the test
  // helper), ops confirm the exit today; the daily job completes it and opens
  // the 8A reconciliation task for the visits not done.
  const c4 = await mk("sahip-donem", "Dönem", "+905550000044");
  const m4 = await member(
    ops,
    c4,
    { name: "Deneme Bahçesi Dönem", lon: 37.72, lat: 37.17 },
    {
      early: true,
    },
  );
  const periodRemoval = one(
    check(
      await c4.client.rpc("customer_request_garden_removal", {
        p_parcel_id: m4.parcelId,
        p_reason: "cost",
        p_timing: "period_end",
      }),
    ),
  );
  await setPeriod(m4.orderId, addDays(today, -365), addDays(today, -1));
  check(
    await ops.rpc("ops_schedule_garden_removal", {
      p_removal_id: periodRemoval,
      p_effective_on: today,
      p_note: "Dönem dün bitti.",
    }),
  );
  await runHousekeeping();

  // 5. "Hemen": confirmed for today and completed at once; the refund of the
  // unused visits is opened by the system (a transfer refund to make).
  const c5 = await mk("sahip-hemen", "Hemen", "+905550000045");
  const m5 = await member(
    ops,
    c5,
    { name: "Deneme Bahçesi Hemen", lon: 37.74, lat: 37.18 },
    {
      early: true,
    },
  );
  const completedRemoval = one(
    check(
      await c5.client.rpc("customer_request_garden_removal", {
        p_parcel_id: m5.parcelId,
        p_reason: "not_needed",
        p_timing: "notice",
      }),
    ),
  );
  check(
    await ops.rpc("ops_schedule_garden_removal", {
      p_removal_id: completedRemoval,
      p_effective_on: today,
      p_note: "Sahip telefonda hemen çıkmak istedi.",
    }),
  );
  check(await ops.rpc("ops_complete_garden_removal", { p_removal_id: completedRemoval }));

  // 6. A card payment, a goodwill refund asked on it, and the provider
  // declining it: the payments function reports the result with the service
  // role (payment_refund_claim / payment_refund_report); the fake provider
  // never declines, so the spec reports it in its place.
  const c6 = await mk("sahip-kart", "Kart", "+905550000046");
  const m6 = await member(
    ops,
    c6,
    { name: "Deneme Bahçesi Kart", lon: 37.76, lat: 37.19 },
    {
      early: true,
      pay: "card",
    },
  );
  const payment = check(
    await admin
      .from("payment")
      .select("id")
      .eq("order_id", m6.orderId)
      .eq("status", "succeeded")
      .limit(1)
      .single(),
  );
  const refund = one(
    check(
      await ops.rpc("ops_request_refund", {
        p_payment_id: payment.id,
        p_amount_kurus: 50000,
        p_reason: "goodwill",
        p_note: "Envanter bir hafta gecikti; jest olarak.",
      } as never),
    ),
  );
  const claim = check(await admin.rpc("payment_refund_claim", { p_refund_id: refund })) as {
    kind?: string;
  };
  check(
    await admin.rpc("payment_refund_report", {
      p_refund_id: refund,
      p_outcome: "failed",
      p_kind: claim.kind === "void" ? "void" : "refund",
      p_failure_code: "provider_error",
      p_retryable: true,
    } as never),
  );

  // Notifications: what the sender (send-notifications) would have done to
  // two messages of these customers: one sent, one failed after 5 tries.
  const users = [c1.userId, c2.userId];
  const rows = check(
    await admin
      .from("notification")
      .select("id, recipient_user_id, template")
      .in("recipient_user_id", users)
      .order("created_at"),
  );
  const sent = rows.find((r) => r.recipient_user_id === c1.userId);
  const failed = rows.find((r) => r.recipient_user_id === c2.userId);
  if (sent) {
    check(
      await admin
        .from("notification")
        .update({
          status: "sent",
          attempts: 1,
          sent_at: new Date().toISOString(),
          sent_via: "netgsm/sms",
        })
        .eq("id", sent.id),
    );
  }
  if (failed) {
    check(
      await admin
        .from("notification")
        .update({ status: "failed", attempts: 5, last_error: "provider_error:30" })
        .eq("id", failed.id),
    );
  }

  return {
    requestedRemoval,
    scheduledRemoval,
    blockedRemoval,
    completedRemoval,
    customerName: `${PREFIX} Talep`,
  };
}

async function setPeriod(orderId: string, start: string, end: string) {
  const { setOrderPeriod } = await import("../local-db");
  await setOrderPeriod(orderId, start, end);
}

async function runHousekeeping() {
  const { runGardenRemovalHousekeeping } = await import("../local-db");
  return runGardenRemovalHousekeeping();
}
