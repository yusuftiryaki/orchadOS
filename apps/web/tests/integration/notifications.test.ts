import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listNotifications, retryNotification } from "@/lib/notifications/data";
import type { Client } from "@/lib/supabase/types";
import { purgeParcels } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";

// Notifications against the local stack: an expert approves a critical finding
// and publishes a visit (the real database functions), the queue fills, and
// the send-notifications Edge Function hands the messages to the record
// provider (no SMS leaves the machine). The seed owner (WhatsApp) and viewer
// (SMS) get access to a parcel of the test's own; it is removed at the end.

const run = Date.now().toString(36);
const PARCEL = "f6000000-0000-4000-8000-000000000001";
const SESSION = "f6100000-0000-4000-8000-000000000001";
const FINDING = "f6200000-0000-4000-8000-000000000001";
const OWNER = { id: "a0000000-0000-4000-8000-000000000001", phone: "+905550000001" };
const VIEWER = { id: "a0000000-0000-4000-8000-000000000002", phone: "+905550000002" };

let admin: Client;

function check<T>(result: { data: T; error: unknown }): { data: NonNullable<T> } {
  if (result.error) throw result.error;
  return { data: result.data as NonNullable<T> };
}

async function queue() {
  const { data } = check(
    await admin
      .from("notification")
      .select("id, recipient_user_id, channel, template, status, attempts, sent_via, vars")
      .eq("parcel_id", PARCEL)
      .order("recipient_user_id"),
  );
  return data;
}

async function dispatch(token?: string) {
  const env = inject("supabase");
  const res = await fetch(`${env.url}/functions/v1/send-notifications`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token ?? env.serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ limit: 100 }),
  });
  return { status: res.status, body: await res.json() };
}

async function outbox(phone: string) {
  const { data } = check(await admin.rpc("message_outbox_list", { p_recipient: phone }));
  return data;
}

beforeAll(async () => {
  admin = serviceClient();
  purgeParcels(SEED.org, [PARCEL]);
  check(
    await admin
      .from("parcel")
      .insert({ id: PARCEL, org_id: SEED.org, name: `Bildirim testi ${run}` }),
  );
  check(
    await admin.from("parcel_access").insert([
      { org_id: SEED.org, parcel_id: PARCEL, user_id: OWNER.id, role: "owner" },
      { org_id: SEED.org, parcel_id: PARCEL, user_id: VIEWER.id, role: "viewer" },
    ]),
  );
  // No trees: the expert can sign without assessing any.
  check(
    await admin.from("session").insert({
      id: SESSION,
      org_id: SEED.org,
      parcel_id: PARCEL,
      kind: "periodic_scan",
      status: "in_review",
      started_at: "2026-10-14T07:00:00Z",
    }),
  );
});

afterAll(() => {
  purgeParcels(SEED.org, [PARCEL]);
});

describe("notifications", () => {
  it("a critical finding is notified when the expert approves it, before the report", async () => {
    const { client: expert } = await signIn("expert");
    check(
      await expert.from("finding").insert({
        id: FINDING,
        org_id: SEED.org,
        parcel_id: PARCEL,
        session_id: SESSION,
        kind: "theft_trace",
        severity: "high",
        description: "Kesilmiş dallar",
      }),
    );
    expect(await queue()).toEqual([]);

    check(await expert.rpc("approve_finding", { p_finding_id: FINDING }));
    check(await expert.rpc("approve_finding", { p_finding_id: FINDING }));
    const rows = await queue();
    expect(rows.map((r) => [r.recipient_user_id, r.template, r.channel, r.status])).toEqual([
      [OWNER.id, "critical_finding", "whatsapp", "pending"],
      [VIEWER.id, "critical_finding", "sms", "pending"],
    ]);
    expect(rows[0].vars).toEqual({
      parcel_name: `Bildirim testi ${run}`,
      date: "2026-10-14",
      path: `/portal/parsel/${PARCEL}`,
    });

    const result = await dispatch();
    expect(result.status).toBe(200);
    expect((await queue()).map((r) => [r.status, r.sent_via, r.attempts])).toEqual([
      ["sent", "record/whatsapp", 1],
      ["sent", "record/sms", 1],
    ]);
    const kept = (await outbox(VIEWER.phone)).find((m) => m.notification_id === rows[1].id);
    expect(kept?.body).toBe(
      `Bildirim testi ${run} için 14 Ekim denetiminde uzmanımız acil bir bulgu onayladı. ` +
        `Ayrıntı: http://127.0.0.1:3000/portal/parsel/${PARCEL}`,
    );
  });

  it("publishing the visit sends 'report ready' once to the owner and the viewer", async () => {
    const { client: expert } = await signIn("expert");
    check(await expert.rpc("publish_session", { p_session_id: SESSION }));
    const again = await expert.rpc("publish_session", { p_session_id: SESSION });
    expect(again.error).not.toBeNull();

    const reports = (await queue()).filter((r) => r.template === "report_ready");
    expect(reports.map((r) => [r.recipient_user_id, r.status])).toEqual([
      [OWNER.id, "pending"],
      [VIEWER.id, "pending"],
    ]);

    expect((await dispatch()).status).toBe(200);
    const sent = (await queue()).filter((r) => r.template === "report_ready");
    expect(sent.map((r) => r.status)).toEqual(["sent", "sent"]);
    const message = (await outbox(OWNER.phone)).find((m) => m.notification_id === sent[0].id);
    expect(message).toMatchObject({
      channel: "whatsapp",
      purpose: "notification",
      body: `Bildirim testi ${run} için 14 Ekim denetim raporunuz hazır: http://127.0.0.1:3000/portal/parsel/${PARCEL}`,
    });

    // Nothing left to send for this parcel: no duplicates.
    await dispatch();
    expect(await queue()).toHaveLength(4);
    const owned = (await outbox(OWNER.phone)).filter((m) => m.notification_id === sent[0].id);
    expect(owned).toHaveLength(1);
  });

  it("an owner sees only their own notifications", async () => {
    const { client: owner } = await signIn("owner");
    const { data } = check(await owner.from("notification").select("recipient_user_id"));
    expect(data.length).toBeGreaterThanOrEqual(2);
    expect(new Set(data.map((r) => r.recipient_user_id))).toEqual(new Set([OWNER.id]));

    const { client: viewer } = await signIn("viewer");
    const seen = check(
      await viewer.from("notification").select("recipient_user_id").eq("parcel_id", PARCEL),
    ).data;
    expect(seen.map((r) => r.recipient_user_id)).toEqual([VIEWER.id, VIEWER.id]);

    const update = await owner
      .from("notification")
      .update({ status: "failed" })
      .eq("parcel_id", PARCEL)
      .select("id");
    expect(update.error?.code).toBe("42501");
  });

  it("only the service role may run the sender", async () => {
    const { client: owner } = await signIn("owner");
    const token = (await owner.auth.getSession()).data.session?.access_token;
    expect((await dispatch(token)).status).toBe(403);
    expect((await owner.rpc("notification_claim", { p_limit: 1 })).error).not.toBeNull();
    expect(
      (await owner.rpc("message_outbox_list", { p_recipient: OWNER.phone })).error,
    ).not.toBeNull();
  });
});

describe("operations list", () => {
  it("ops sees the queue with masked phones and puts a failed message back", async () => {
    const failed = (await queue())[0];
    check(
      await admin
        .from("notification")
        .update({ status: "failed", sent_at: null, last_error: "provider_error:30" })
        .eq("id", failed.id),
    );

    const { client: ops } = await signIn("ops");
    const rows = (await listNotifications(ops, { status: "failed" })).filter(
      (r) => r.parcelId === PARCEL,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: failed.id,
      recipientName: "Örnek Sahip",
      recipientRole: "owner",
      recipientPhone: "+90 5•• ••• •• 01",
      lastError: "provider_error:30",
    });
    const all = await listNotifications(ops);
    expect(all.every((r) => !/\d{5}/.test(r.recipientPhone))).toBe(true);

    const { client: owner } = await signIn("owner");
    expect(await listNotifications(owner)).toEqual([]);
    expect(await retryNotification(owner, failed.id)).toBe(false);

    expect(await retryNotification(ops, failed.id)).toBe(true);
    expect(await retryNotification(ops, failed.id)).toBe(false);
    expect((await dispatch()).status).toBe(200);
    const after = (await queue()).find((r) => r.id === failed.id);
    expect(after).toMatchObject({ status: "sent", attempts: 1 });
  });
});
