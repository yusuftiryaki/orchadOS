import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeOrg } from "../local-db";
import {
  activeOrderFor,
  createCustomer,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { PASSWORD, serviceClient } from "./fixtures";
import { kvkk, lit, printed, sql, value } from "./kvkk-scripts-helpers";

// T11 (docs/hukuk/kararlar.md H26): scripts/kvkk/run.sh against a synthetic
// customer A with an active order (parcel PA, payment, consents), a co-owner
// viewer V invited by A, A's question with an expert reply, a site contact
// ("Kemal Bekçi", the boundary pointer) and field events on PA, an audit row
// that wrongly holds A's phone, and a demo org holding look-alike data.

const DOMAIN = "kvkk-scripts.test";
const NAME = "Test Müşteri"; // createCustomer's owner profile name
const POINTER = "Kemal Bekçi";
const POINTER_PHONE = `+90532${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
const REQ = (n: number) => `K-1999-${String(Math.floor(Math.random() * 900) + 100)}${n}`;
const REDACTED = "[KVKK başvurusu üzerine silindi]";

let a: TestCustomer;
let aPhone: string;
let order: string;
let parcel: string;
let viewerId: string;
let viewerPhone: string;
let question: string;
let expertReply: string;
let session: string;
let orgId: string;
const demoOrg = randomUUID();
const demoParcel = randomUUID();
const ev = {
  pointerA: randomUUID(),
  pointerKemal: randomUUID(),
  noteA: randomUUID(),
  noteOther: randomUUID(),
  demoPointer: randomUUID(),
};
const requests = { viewer: REQ(1), person: REQ(2), subject: REQ(3) };

const pseudonym = (key: string) =>
  value(`select 'kvkk-' || left(encode(sha256(convert_to(${lit(key)}, 'UTF8')), 'hex'), 8)`);

function eventPayload(id: string): string {
  return value(`select payload from public.session_event where id = '${id}'`);
}

// Everything the scripts may change, for the dry-run comparison.
function snapshot(): string {
  return value(`select json_build_object(
    'owner', (select json_agg(o order by o.id) from private.owner_profile o where o.user_id = '${a.id}'),
    'detail', (select row_to_json(d) from private.parcel_detail d where d.parcel_id = '${parcel}'),
    'questions', (select json_agg(q order by q.id) from public.question q where q.parcel_id = '${parcel}'),
    'replies', (select json_agg(r order by r.id) from public.question_reply r where r.parcel_id = '${parcel}'),
    'invitations', (select json_agg(v order by v.id) from private.viewer_invitation v where v.parcel_id = '${parcel}'),
    'access', (select json_agg(x order by x.id) from public.parcel_access x where x.parcel_id = '${parcel}'),
    'events', (select json_agg(e order by e.id) from public.session_event e where e.parcel_id = '${parcel}'),
    'audit', (select count(*) from public.audit_event where org_id = '${orgId}')
  )::jsonb::text`);
}

// Retention-bound rows of A (H26 item 1): never changed.
function retained(): string {
  return value(`select json_build_object(
    'billing', (select json_agg(b) from private.billing_profile b where b.user_id = '${a.id}'),
    'orders', (select json_agg(o.id) from public.service_order o where o.customer_user_id = '${a.id}'),
    'quotes', (select count(*) from public.quote where customer_user_id = '${a.id}'),
    'payments', (select json_agg(p) from public.payment p where p.customer_user_id = '${a.id}'),
    'consents', (select json_agg(c order by c.id) from private.consent_record c where c.subject_id = '${a.id}')
  )::jsonb::text`);
}

function demoData(): string {
  return value(`select json_build_object(
    'detail', (select row_to_json(d) from private.parcel_detail d where d.parcel_id = '${demoParcel}'),
    'invitations', (select json_agg(v) from private.viewer_invitation v where v.parcel_id = '${demoParcel}'),
    'events', (select json_agg(e) from public.session_event e where e.parcel_id = '${demoParcel}')
  )::jsonb::text`);
}

// Seed owner of the seed org: another owner whose data must stay.
function seedOwner(): string {
  return value(`select row_to_json(o)::text from private.owner_profile o
    join auth.users u on u.id = o.user_id where u.email = 'owner@example.com'`);
}

beforeAll(async () => {
  await removeCustomers(DOMAIN);
  a = await createCustomer(DOMAIN);
  ({
    order,
    parcels: [parcel],
  } = await activeOrderFor(a));
  aPhone = value(`select phone from private.owner_profile where user_id = '${a.id}'`);
  orgId = value(`select org_id from public.parcel where id = '${parcel}'`);

  // Co-owner V: an account with viewer access, invited by A (approved).
  viewerPhone = `+90556${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
  const admin = serviceClient();
  const created = await admin.auth.admin.createUser({
    email: `hissedar-${randomUUID().slice(0, 8)}@${DOMAIN}`,
    password: PASSWORD,
    email_confirm: true,
    phone: viewerPhone.slice(1),
    phone_confirm: true,
  });
  if (created.error) throw created.error;
  viewerId = created.data.user.id;
  const expert = value(`select id from auth.users where email = 'expert@example.com'`);
  session = randomUUID();

  sql(`
    insert into public.parcel_access (org_id, parcel_id, user_id, role)
    values ('${orgId}', '${parcel}', '${viewerId}', 'viewer');
    insert into private.viewer_invitation (org_id, parcel_id, full_name, phone, invited_by, status, user_id, resolved_at)
    values ('${orgId}', '${parcel}', ${lit("Ayşe Hissedar")}, '${viewerPhone}', '${a.id}', 'approved', '${viewerId}', now());

    insert into private.parcel_detail (parcel_id, org_id) values ('${parcel}', '${orgId}')
      on conflict (parcel_id) do nothing;
    update private.parcel_detail
    set site_contact_name = ${lit(POINTER)}, site_contact_phone = '${POINTER_PHONE}',
        access_note = ${lit(`Anahtar ${NAME} kişisinde, tel ${aPhone}`)}
    where parcel_id = '${parcel}';

    with s as (
      insert into public.slot (org_id, parcel_id, row_no, position_no)
      values ('${orgId}', '${parcel}', 1, 1) returning id
    )
    insert into public.tree (org_id, parcel_id, slot_id) select '${orgId}', '${parcel}', id from s;

    insert into public.session (id, org_id, parcel_id, kind) values ('${session}', '${orgId}', '${parcel}', 'inventory');
    insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns, time_source, phone_time)
    values
      ('${ev.pointerA}', '${orgId}', '${parcel}', '${session}', 'boundary_pointer',
       ${lit(JSON.stringify({ name: NAME, role: "owner" }))}, 1, 'phone', now()),
      ('${ev.pointerKemal}', '${orgId}', '${parcel}', '${session}', 'boundary_pointer',
       ${lit(JSON.stringify({ name: POINTER, role: "guard" }))}, 2, 'phone', now()),
      ('${ev.noteA}', '${orgId}', '${parcel}', '${session}', 'field_notice_verbal',
       ${lit(JSON.stringify({ note: `${NAME} sözlü bilgilendirildi, tel ${aPhone}` }))}, 3, 'phone', now()),
      ('${ev.noteOther}', '${orgId}', '${parcel}', '${session}', 'visit_blocked',
       ${lit(JSON.stringify({ note: "Kapı kilitliydi" }))}, 4, 'phone', now());

    insert into public.audit_event (org_id, actor_role, action, entity_type, details)
    values ('${orgId}', 'system', 'test.kvkk_leak', 'owner_profile', jsonb_build_object('phone', '${aPhone}'));

    -- A demo org with look-alike data: never in scope.
    insert into public.org (id, name) values ('${demoOrg}', 'KVKK demo test');
    insert into private.demo_org (org_id) values ('${demoOrg}');
    insert into public.parcel (id, org_id, name) values ('${demoParcel}', '${demoOrg}', 'Demo');
    insert into private.parcel_detail (parcel_id, org_id, site_contact_name, site_contact_phone, access_note)
    values ('${demoParcel}', '${demoOrg}', ${lit(NAME)}, '${aPhone}', ${lit(NAME)});
    insert into private.viewer_invitation (org_id, parcel_id, full_name, phone, status)
    values ('${demoOrg}', '${demoParcel}', ${lit(NAME)}, '${aPhone}', 'pending');
    insert into public.session (id, org_id, parcel_id, kind) values ('${ev.demoPointer}', '${demoOrg}', '${demoParcel}', 'inventory');
    insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns, time_source, phone_time)
    values ('${ev.demoPointer}', '${demoOrg}', '${demoParcel}', '${ev.demoPointer}', 'boundary_pointer',
            ${lit(JSON.stringify({ name: NAME, role: "owner" }))}, 1, 'phone', now());
  `);

  const tree = value(`select id from public.tree where parcel_id = '${parcel}'`);
  question =
    value(`insert into public.question (org_id, parcel_id, tree_id, body, author_role, created_by)
    values ('${orgId}', '${parcel}', '${tree}', ${lit(`Ağaç neden sarardı? ${NAME}`)}, 'owner', '${a.id}') returning id`);
  expertReply =
    value(`insert into public.question_reply (org_id, parcel_id, question_id, body, author_role, created_by)
    values ('${orgId}', '${parcel}', '${question}', 'Su stresi.', 'expert', '${expert}') returning id`);
  sql(`insert into public.question_reply (org_id, parcel_id, question_id, body, author_role, created_by)
    values ('${orgId}', '${parcel}', '${question}', 'Teşekkürler', 'owner', '${a.id}')`);
}, 120_000);

afterAll(async () => {
  // Audit rows of these requests (insert-only: removed with triggers off).
  sql(`begin; set local session_replication_role = replica;
    delete from public.audit_event where details ->> 'request' like 'K-1999-%' or action = 'test.kvkk_leak';
    commit;`);
  await purgeOrg(demoOrg);
  await removeCustomers(DOMAIN);
}, 120_000);

describe("scripts/kvkk/run.sh", () => {
  it("rejects bad arguments before touching the database", () => {
    expect(kvkk(["erase", "--subject", "nope", "--request", "K-1999-001"]).status).toBe(2);
    expect(kvkk(["erase", "--subject", a.id, "--request", "1"]).status).toBe(2);
    expect(kvkk(["erase", "--person-name", POINTER, "--request", "K-1999-001"]).status).toBe(2);
    expect(
      kvkk(["inventory", "--subject", a.id, "--request", "K-1999-001", "--apply"]).status,
    ).toBe(2);
    expect(
      kvkk(["erase", "--subject", a.id, "--request", "K-1999-001", "--force-active"]).status,
    ).toBe(2);
  });

  it("inventory lists the subject's data and the retention-bound rows, without personal data", () => {
    const run = kvkk(["inventory", "--subject", a.id, "--request", requests.subject]);
    expect(run.status, run.stderr).toBe(0);
    for (const table of [
      "private.owner_profile",
      "private.parcel_detail",
      "public.question",
      "public.question_reply",
      "private.viewer_invitation",
      "public.parcel_access",
      "public.session_event (boundary_pointer)",
      "public.session_event (notes mentioning the subject)",
      "private.consent_record",
      "public.payment",
      "public.service_order",
    ]) {
      expect(run.stdout).toMatch(new RegExp(`\\n ${table.replace(/[()]/g, "\\$&")}\\s+\\|`));
    }
    expect(run.stdout).toContain(ev.noteOther);
    expect(run.stdout).not.toContain(NAME);
    expect(run.stdout).not.toContain(aPhone);
  });

  it("refuses erase and pseudonymize while the contract runs", () => {
    for (const command of ["erase", "pseudonymize"]) {
      const run = kvkk([command, "--subject", a.id, "--request", requests.subject, "--apply"]);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain("kvkk_active_contract");
    }
  });

  it("a dry run changes nothing, even when forced", () => {
    const before = snapshot();
    for (const command of ["pseudonymize", "erase"]) {
      const run = kvkk([
        command,
        "--subject",
        a.id,
        "--request",
        requests.subject,
        "--include-notes",
        "--force-active",
        "--reason",
        "dry run in the integration test",
      ]);
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain("dry run (rollback)");
    }
    const erase = kvkk([
      "erase",
      "--subject",
      a.id,
      "--request",
      requests.subject,
      "--force-active",
      "--reason",
      "dry run in the integration test",
    ]);
    expect(printed(erase, "private.owner_profile", "clear name, phone, email")).toBe(1);
    expect(snapshot()).toBe(before);
  });

  it("erase --apply needs pseudonymize --apply first", () => {
    const run = kvkk([
      "erase",
      "--subject",
      a.id,
      "--request",
      requests.subject,
      "--apply",
      "--force-active",
      "--reason",
      "ordering check in the integration test",
    ]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain("kvkk_pseudonymize_first");
  });

  it("co-owner request (H26 item 6): the viewer's account access and invitation go, A's data stays", () => {
    const ownerBefore = value(
      `select row_to_json(o)::text from private.owner_profile o where o.user_id = '${a.id}'`,
    );
    const detailBefore = value(
      `select row_to_json(d)::text from private.parcel_detail d where d.parcel_id = '${parcel}'`,
    );
    for (const command of ["pseudonymize", "erase"]) {
      const run = kvkk([command, "--subject", viewerId, "--request", requests.viewer, "--apply"]);
      expect(run.status, run.stderr).toBe(0);
    }
    expect(value(`select count(*) from public.parcel_access where user_id = '${viewerId}'`)).toBe(
      "0",
    );
    expect(
      value(`select count(*) from private.viewer_invitation where user_id = '${viewerId}'`),
    ).toBe("0");
    expect(value(`select count(*) from public.parcel_access where user_id = '${a.id}'`)).toBe("1");
    expect(
      value(`select row_to_json(o)::text from private.owner_profile o where o.user_id = '${a.id}'`),
    ).toBe(ownerBefore);
    expect(
      value(
        `select row_to_json(d)::text from private.parcel_detail d where d.parcel_id = '${parcel}'`,
      ),
    ).toBe(detailBefore);
  });

  it("person without an account (--person-name): the boundary pointer is pseudonymised and the site contact cleared", () => {
    const demoBefore = demoData();
    // The name as the operator types it (spacing differs).
    const args = ["--person-name", "  Kemal   Bekçi ", "--parcel", parcel];
    for (const command of ["pseudonymize", "erase"]) {
      const run = kvkk([command, ...args, "--request", requests.person, "--apply"]);
      expect(run.status, run.stderr).toBe(0);
    }
    const expected = pseudonym(`kemal bekçi${parcel}`);
    expect(JSON.parse(eventPayload(ev.pointerKemal))).toEqual({ name: expected, role: "guard" });
    expect(JSON.parse(eventPayload(ev.pointerA)).name).toBe(NAME);
    const [contactName, contactPhone, note] = sql(
      `select coalesce(site_contact_name, '-'), coalesce(site_contact_phone, '-'), access_note
       from private.parcel_detail where parcel_id = '${parcel}'`,
    )[0];
    expect([contactName, contactPhone]).toEqual(["-", "-"]);
    expect(note).toContain(NAME); // the owner's data is not the person's
    expect(demoData()).toBe(demoBefore);
    const audit = sql(`select action, details::text from public.audit_event
      where details ->> 'request' = '${requests.person}' order by created_at`);
    expect(audit.map((r) => r[0])).toEqual(["kvkk.pseudonymized", "kvkk.erased"]);
    for (const [, details] of audit) {
      expect(details).not.toContain("Kemal");
      expect(details).toContain(expected);
    }
  });

  it("subject after the contract ended: pseudonymize and erase apply, retention-bound rows stay", () => {
    sql(
      `update public.service_order set status = 'completed', completed_at = now() where id = '${order}'`,
    );
    sql(`update public.parcel set status = 'passive' where id = '${parcel}'`);
    const keep = retained();
    const demoBefore = demoData();
    const seedBefore = seedOwner();
    const ps = pseudonym(a.id);

    const pseudo = kvkk([
      "pseudonymize",
      "--subject",
      a.id,
      "--request",
      requests.subject,
      "--include-notes",
      "--apply",
    ]);
    expect(pseudo.status, pseudo.stderr).toBe(0);
    expect(printed(pseudo, "public.session_event", "boundary_pointer name")).toBe(1);
    expect(printed(pseudo, "public.session_event", "note text")).toBe(1);
    expect(printed(pseudo, "public.audit_event", "details text")).toBe(1);
    expect(JSON.parse(eventPayload(ev.pointerA))).toEqual({ name: ps, role: "owner" });
    const note = JSON.parse(eventPayload(ev.noteA)).note as string;
    expect(note).toBe(`${ps} sözlü bilgilendirildi, tel ${ps}`);
    expect(JSON.parse(eventPayload(ev.noteOther))).toEqual({ note: "Kapı kilitliydi" });
    expect(
      value(
        `select details ->> 'phone' from public.audit_event where action = 'test.kvkk_leak' and org_id = '${orgId}'`,
      ),
    ).toBe(ps);

    const erase = kvkk(["erase", "--subject", a.id, "--request", requests.subject, "--apply"]);
    expect(erase.status, erase.stderr).toBe(0);

    const [fullName, phone, email, consent] = sql(
      `select full_name, coalesce(phone, '-'), coalesce(email, '-'), kvkk_consent::text
       from private.owner_profile where user_id = '${a.id}'`,
    )[0];
    expect([fullName, phone, email, consent]).toEqual([ps, "-", "-", "true"]);
    // No other party left on PA: contact and access note cleared.
    expect(
      sql(`select coalesce(site_contact_name, '-'), coalesce(access_note, '-')
           from private.parcel_detail where parcel_id = '${parcel}'`)[0],
    ).toEqual(["-", "-"]);
    expect(
      sql(
        `select body, coalesce(created_by::text, '-') from public.question where id = '${question}'`,
      )[0],
    ).toEqual([REDACTED, "-"]);
    expect(value(`select body from public.question_reply where id = '${expertReply}'`)).toBe(
      "Su stresi.",
    );
    expect(
      value(
        `select count(*) from public.question_reply where parcel_id = '${parcel}' and body = ${lit(REDACTED)}`,
      ),
    ).toBe("1");
    expect(value(`select count(*) from public.parcel_access where user_id = '${a.id}'`)).toBe("0");
    expect(
      value(`select count(*) from private.viewer_invitation where invited_by = '${a.id}'`),
    ).toBe("0");

    expect(retained()).toBe(keep);
    expect(demoData()).toBe(demoBefore);
    expect(seedOwner()).toBe(seedBefore);

    const audit =
      sql(`select action, coalesce(actor_user_id::text, '-'), details::text from public.audit_event
      where details ->> 'request' = '${requests.subject}' order by created_at`);
    expect(audit.map((r) => r[0])).toEqual(["kvkk.pseudonymized", "kvkk.erased"]);
    for (const [, actor, details] of audit) {
      expect(actor).toBe("-");
      expect(details).not.toContain(NAME);
      expect(details).not.toContain(aPhone);
      expect(JSON.parse(details)).toMatchObject({ subject_kind: "user", subject_ref: ps });
    }
    expect(JSON.parse(audit[1][2]).counts["private.owner_profile:clear name, phone, email"]).toBe(
      1,
    );

    // A second run finds nothing left to change.
    const again = kvkk(["erase", "--subject", a.id, "--request", requests.subject]);
    expect(again.status, again.stderr).toBe(0);
    expect(printed(again, "private.owner_profile", "clear name, phone, email")).toBe(0);
  });
});
