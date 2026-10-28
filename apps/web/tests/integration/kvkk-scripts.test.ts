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
import { KEY, kvkk, lit, printed, sql, value } from "./kvkk-scripts-helpers";

// T11 (docs/hukuk/kararlar.md H26): scripts/kvkk/run.sh against a synthetic
// customer A with an active order (parcel PA, payment, consents), a co-owner
// viewer V invited by A (single-word name "Ece"), A's question with an expert
// reply, a site contact ("Kemal Bekçi", the boundary pointer) and field
// events on PA, audit rows tied to A and to nobody, and a demo org holding
// look-alike data. Namesakes ("Kemal Bekçioğlu", "Test Müşterisi"), words
// containing a name ("gece") and uuids containing a name or a phone number
// are never changed.

const DOMAIN = "kvkk-scripts.test";
const NAME = "Test Müşteri"; // createCustomer's owner profile name
const POINTER = "Kemal Bekçi";
const LONGER = "Kemal Bekçioğlu"; // another person
const VIEWER_NAME = "Ece"; // single word: never matched
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
let staffReplyByA: string;
let session: string;
let orgId: string;
let accessNote: string;
let uuidWithPhone: string;
const uuidWithName = "11111111-4ece-4ece-8ece-0000000ece00";
const demoOrg = randomUUID();
const demoParcel = randomUUID();
const ev = {
  pointerA: randomUUID(),
  pointerKemal: randomUUID(),
  pointerLonger: randomUUID(),
  pointerEce: randomUUID(),
  noteA: randomUUID(),
  noteKemal: randomUUID(),
  noteNamesake: randomUUID(),
  noteOther: randomUUID(),
  demoPointer: randomUUID(),
};
const audit = {
  leak: randomUUID(),
  inScope: randomUUID(),
  namesake: randomUUID(),
  kemalIn: randomUUID(),
  kemalOut: randomUUID(),
};
const requests = { viewer: REQ(1), person: REQ(2), subject: REQ(3) };

const pseudonym = (input: string) =>
  value(`select 'kvkk-' || left(encode(extensions.hmac(convert_to(${lit(input)}, 'UTF8'),
    convert_to(${lit(KEY)}, 'UTF8'), 'sha256'), 'hex'), 8)`);

function eventPayload(id: string): string {
  return value(`select payload from public.session_event where id = '${id}'`);
}

function auditDetails(id: string): Record<string, unknown> {
  return JSON.parse(value(`select details::text from public.audit_event where id = '${id}'`));
}

function detailRow(): string {
  return value(
    `select row_to_json(d)::text from private.parcel_detail d where d.parcel_id = '${parcel}'`,
  );
}

// Rows no command may ever change: namesakes, substrings, uuids.
function untouchable(): string {
  return value(`select json_build_object(
    'events', (select json_agg(e.payload order by e.id) from public.session_event e
               where e.id in ('${ev.pointerLonger}', '${ev.pointerEce}', '${ev.noteNamesake}', '${ev.noteOther}')),
    'audit', (select json_agg(x.details order by x.id) from public.audit_event x
              where x.id in ('${audit.namesake}', '${audit.kemalOut}'))
  )::jsonb::text`);
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
    'audit', (select json_agg(x.details order by x.id) from public.audit_event x where x.org_id = '${orgId}')
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
  const ownerProfile = value(`select id from private.owner_profile where user_id = '${a.id}'`);
  // A uuid whose last group is A's phone number without "+".
  uuidWithPhone = `00000000-0000-4000-8000-${aPhone.slice(1)}`;
  accessNote = `Anahtar ${NAME} kişisinde, tel ${aPhone}; ${LONGER} da bilir; gece ${VIEWER_NAME} gelir`;

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
  const event = (id: string, type: string, payload: unknown, n: number) =>
    `('${id}', '${orgId}', '${parcel}', '${session}', '${type}', ${lit(JSON.stringify(payload))}, ${n}, 'phone', now())`;

  sql(`
    insert into public.parcel_access (org_id, parcel_id, user_id, role)
    values ('${orgId}', '${parcel}', '${viewerId}', 'viewer');
    insert into private.viewer_invitation (org_id, parcel_id, full_name, phone, invited_by, status, user_id, resolved_at)
    values ('${orgId}', '${parcel}', ${lit(VIEWER_NAME)}, '${viewerPhone}', '${a.id}', 'approved', '${viewerId}', now());

    insert into private.parcel_detail (parcel_id, org_id) values ('${parcel}', '${orgId}')
      on conflict (parcel_id) do nothing;
    update private.parcel_detail
    set site_contact_name = ${lit(POINTER)}, site_contact_phone = '${POINTER_PHONE}',
        access_note = ${lit(accessNote)}
    where parcel_id = '${parcel}';

    with s as (
      insert into public.slot (org_id, parcel_id, row_no, position_no)
      values ('${orgId}', '${parcel}', 1, 1) returning id
    )
    insert into public.tree (org_id, parcel_id, slot_id) select '${orgId}', '${parcel}', id from s;

    insert into public.session (id, org_id, parcel_id, kind) values ('${session}', '${orgId}', '${parcel}', 'inventory');
    insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns, time_source, phone_time)
    values
      ${event(ev.pointerA, "boundary_pointer", { name: NAME, role: "owner" }, 1)},
      ${event(ev.pointerKemal, "boundary_pointer", { name: POINTER, role: "guard" }, 2)},
      ${event(ev.pointerLonger, "boundary_pointer", { name: LONGER, role: "guard" }, 3)},
      ${event(ev.pointerEce, "boundary_pointer", { name: VIEWER_NAME, role: "co_owner" }, 4)},
      ${event(ev.noteA, "field_notice_verbal", { note: `${NAME} sözlü bilgilendirildi, tel ${aPhone}` }, 5)},
      ${event(ev.noteKemal, "field_notice_verbal", { note: `${POINTER} sınırı gösterdi` }, 6)},
      ${event(
        ev.noteNamesake,
        "field_notice_objection",
        {
          note: `gece ${VIEWER_NAME} geldi; Test Müşterisi ve ${LONGER} itiraz etti, tel ${aPhone}0`,
          visit_id: uuidWithName,
          ref: uuidWithPhone,
        },
        7,
      )},
      ${event(ev.noteOther, "visit_blocked", { note: "Kapı kilitliydi" }, 8)};

    -- Wave 2 (T20, T16): ops notes of a hidden image and boundary disputes on PA.
    insert into private.media_suppression (org_id, parcel_id, session_id, target_table, target_id, action, reason, note)
    values ('${orgId}', '${parcel}', '${session}', 'asset', '${randomUUID()}', 'hide', 'kvkk_objection',
            ${lit(`${NAME} panoramada görünüyor, tel ${aPhone}`)});
    insert into private.boundary_dispute (org_id, parcel_id, action, note, created_at)
    values ('${orgId}', '${parcel}', 'open', ${lit(`${NAME} sınıra itiraz etti`)}, now() - interval '1 minute'),
           ('${orgId}', '${parcel}', 'close', ${lit(`${LONGER} ile çözüldü`)}, now());

    insert into public.audit_event (id, org_id, actor_role, action, entity_type, entity_id, details)
    values
      -- Tied to A (A's owner profile, A's order): A's phone and name are replaced, nothing else.
      ('${audit.leak}', '${orgId}', 'system', 'test.kvkk_leak', 'owner_profile', '${ownerProfile}',
       jsonb_build_object('phone', '${aPhone}')),
      ('${audit.inScope}', '${orgId}', 'system', 'test.kvkk_scope', 'order', '${order}',
       jsonb_build_object('order_ref', '${uuidWithPhone}', 'phone', '${aPhone}',
         'reason', ${lit("Test Müşterisi ile görüşüldü")}, 'note', ${lit(`${NAME} aradı`)}, ${lit(NAME)}, 'anahtar')),
      -- Same name, not tied to A: a namesake until someone checks.
      ('${audit.namesake}', '${orgId}', 'ops', 'test.kvkk_namesake', 'order', '${randomUUID()}',
       jsonb_build_object('reason', ${lit(`${NAME} adlı başka müşteri, tel ${aPhone}`)})),
      -- About PA, naming the pointer and a longer namesake.
      ('${audit.kemalIn}', '${orgId}', 'ops', 'test.kvkk_parcel', 'owner_profile', null,
       jsonb_build_object('parcel_id', '${parcel}', 'note', ${lit(`${POINTER} aradı`)}, 'contact', ${lit(LONGER)})),
      -- Another parcel of the org: out of the --person-name scope.
      ('${audit.kemalOut}', '${orgId}', 'ops', 'test.kvkk_parcel', 'owner_profile', null,
       jsonb_build_object('parcel_id', '${randomUUID()}', 'note', ${lit(`${POINTER} aradı`)}));

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
  // A also answered as staff (an owner who is also an expert answers as expert).
  staffReplyByA =
    value(`insert into public.question_reply (org_id, parcel_id, question_id, body, author_role, created_by)
    values ('${orgId}', '${parcel}', '${question}', 'Uzman notu: sulama artırılmalı.', 'expert', '${a.id}') returning id`);
}, 120_000);

afterAll(async () => {
  // Audit rows of these requests (insert-only: removed with triggers off).
  sql(`begin; set local session_replication_role = replica;
    delete from public.audit_event where details ->> 'request' like 'K-1999-%' or action like 'test.kvkk_%';
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
    // A single word or a one-letter word matches other people.
    for (const name of ["Ece", "Halil", "Ali C"]) {
      const run = kvkk([
        "erase",
        "--person-name",
        name,
        "--parcel",
        parcel,
        "--request",
        "K-1999-001",
      ]);
      expect(run.status, name).toBe(2);
    }
    // No pseudonym key: nothing runs.
    expect(
      kvkk(["inventory", "--subject", a.id, "--request", "K-1999-001"], { KVKK_PSEUDONYM_KEY: "" })
        .status,
    ).toBe(2);
    // A hosted URL that is not a strict URI is refused without echoing it.
    const dsn = kvkk([
      "inventory",
      "--subject",
      a.id,
      "--request",
      "K-1999-001",
      "--db-url",
      "host=db.example.invalid user=postgres password=S3cretDsn",
    ]);
    expect(dsn.status).toBe(2);
    expect(dsn.stderr).not.toContain("S3cretDsn");
    const slash = kvkk([
      "inventory",
      "--subject",
      a.id,
      "--request",
      "K-1999-001",
      "--db-url",
      "postgresql://postgres:ab/cdS3cret@db.example.invalid/postgres",
    ]);
    expect(slash.status).toBe(2);
    expect(slash.stderr).not.toContain("S3cret");
    expect(slash.stderr).not.toContain("postgres:ab");
  });

  it("inventory lists the subject's data and the retention-bound rows, without personal data", () => {
    const run = kvkk(["inventory", "--subject", a.id, "--request", requests.subject]);
    expect(run.status, run.stderr).toBe(0);
    for (const table of [
      "private.owner_profile",
      "private.parcel_detail",
      "public.question",
      "public.question_reply",
      "public.question_reply (written as staff)",
      "private.viewer_invitation (accepted by another account)",
      "public.parcel_access",
      "public.session_event (boundary_pointer)",
      "public.session_event (other boundary pointers, review)",
      "public.session_event (notes mentioning the subject)",
      "private.boundary_pointer",
      "private.media_suppression (notes mentioning the subject)",
      "private.boundary_dispute (notes mentioning the subject)",
      "ops notes without an exact match (review)",
      "public.audit_event (details mention the subject)",
      "public.audit_event (match in rows not tied to the subject, review)",
      "private.consent_record",
      "public.payment",
      "public.service_order",
    ]) {
      expect(run.stdout).toMatch(new RegExp(`\\n ${table.replace(/[()]/g, "\\$&")}\\s+\\|`));
    }
    expect(run.stdout).toContain("BAN and scrub");
    for (const id of [ev.noteOther, ev.noteNamesake, ev.pointerLonger, audit.namesake]) {
      expect(run.stdout).toContain(id);
    }
    expect(run.stdout).not.toContain(audit.inScope);
    expect(run.stdout).not.toContain(NAME);
    expect(run.stdout).not.toContain(aPhone);
  });

  it("refuses a --person-name that is the name of an account holder of the parcel", () => {
    const before = snapshot();
    for (const command of ["inventory", "pseudonymize", "erase"]) {
      // The owner's name, typed differently.
      const run = kvkk([
        command,
        "--person-name",
        " test  MÜŞTERİ ",
        "--parcel",
        parcel,
        "--request",
        requests.person,
        ...(command === "inventory" ? [] : ["--apply"]),
      ]);
      expect(run.status, command).toBe(3);
      expect(run.stderr).toContain("kvkk_ambiguous_person");
    }
    expect(snapshot()).toBe(before);
  });

  it("refuses erase and pseudonymize while the contract runs", () => {
    for (const command of ["erase", "pseudonymize"]) {
      const run = kvkk([command, "--subject", a.id, "--request", requests.subject, "--apply"]);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain("kvkk_active_contract");
    }
  });

  it("counts owner access to a live garden after a cancelled online order as a running contract", () => {
    const [status, parcelStatus] = sql(`select o.status::text, p.status::text
      from public.service_order o, public.parcel p where o.id = '${order}' and p.id = '${parcel}'`)[0];
    sql(`begin; set local session_replication_role = replica;
      update public.service_order set status = 'cancelled' where id = '${order}';
      update public.parcel set status = 'active_monitoring' where id = '${parcel}';
      commit;`);
    try {
      expect(
        value(`select count(*) from public.parcel_access
        where user_id = '${a.id}' and parcel_id = '${parcel}' and role = 'owner'`),
      ).toBe("1");
      const run = kvkk(["erase", "--subject", a.id, "--request", requests.subject, "--apply"]);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain("kvkk_active_contract");
    } finally {
      sql(`begin; set local session_replication_role = replica;
        update public.service_order set status = '${status}' where id = '${order}';
        update public.parcel set status = '${parcelStatus}' where id = '${parcel}';
        commit;`);
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

  it("person without an account (--person-name): only the exact whole name on that parcel changes", () => {
    const demoBefore = demoData();
    const keep = untouchable();
    const kemalOut = auditDetails(audit.kemalOut);
    // The name as the operator types it (spacing differs).
    const args = ["--person-name", "  Kemal   Bekçi ", "--parcel", parcel];
    for (const command of ["pseudonymize", "erase"]) {
      const run = kvkk([
        command,
        ...args,
        "--request",
        requests.person,
        "--include-notes",
        "--apply",
      ]);
      expect(run.status, run.stderr).toBe(0);
    }
    const expected = pseudonym(`kemal bekçi${parcel}`);
    expect(JSON.parse(eventPayload(ev.pointerKemal))).toEqual({ name: expected, role: "guard" });
    expect(JSON.parse(eventPayload(ev.noteKemal))).toEqual({ note: `${expected} sınırı gösterdi` });
    expect(JSON.parse(eventPayload(ev.pointerA)).name).toBe(NAME);
    // The longer namesake stays everywhere.
    expect(JSON.parse(eventPayload(ev.pointerLonger)).name).toBe(LONGER);
    expect(auditDetails(audit.kemalIn)).toMatchObject({
      note: `${expected} aradı`,
      contact: LONGER,
    });
    // Same name on another parcel of the org: not this person's record.
    expect(auditDetails(audit.kemalOut)).toEqual(kemalOut);
    const [contactName, contactPhone, note] = sql(
      `select coalesce(site_contact_name, '-'), coalesce(site_contact_phone, '-'), access_note
       from private.parcel_detail where parcel_id = '${parcel}'`,
    )[0];
    expect([contactName, contactPhone]).toEqual(["-", "-"]);
    expect(note).toBe(accessNote); // the owner's data and the longer namesake are not the person's
    expect(untouchable()).toBe(keep);
    expect(demoData()).toBe(demoBefore);
    const rows = sql(`select action, details::text from public.audit_event
      where details ->> 'request' = '${requests.person}' order by created_at`);
    expect(rows.map((r) => r[0])).toEqual(["kvkk.pseudonymized", "kvkk.erased"]);
    for (const [, details] of rows) {
      expect(details).not.toContain("Kemal");
      expect(details).toContain(expected);
    }
  });

  it("subject after the contract ended, co-owner still on the parcel: only A's own data changes", () => {
    sql(
      `update public.service_order set status = 'completed', completed_at = now() where id = '${order}'`,
    );
    sql(`update public.parcel set status = 'passive' where id = '${parcel}'`);
    const keep = retained();
    const demoBefore = demoData();
    const seedBefore = seedOwner();
    const namesakeRows = untouchable();
    const ps = pseudonym(a.id);

    // Without --include-notes first: erase must then refuse (the notes would
    // lose the name it needs).
    const first = kvkk([
      "pseudonymize",
      "--subject",
      a.id,
      "--request",
      requests.subject,
      "--apply",
    ]);
    expect(first.status, first.stderr).toBe(0);
    expect(printed(first, "public.session_event", "boundary_pointer name")).toBe(1);
    expect(printed(first, "public.session_event", "note text")).toBe(0);
    // The copy of A's pointer event (T16) changes with it; ops notes wait for --include-notes.
    expect(printed(first, "private.boundary_pointer", "name")).toBe(1);
    expect(printed(first, "private.media_suppression", "note text")).toBe(0);
    expect(printed(first, "public.audit_event", "details text")).toBe(2);
    const early = kvkk(["erase", "--subject", a.id, "--request", requests.subject, "--apply"]);
    expect(early.status).toBe(3);
    expect(early.stderr).toContain("kvkk_notes_pending");

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
    expect(printed(pseudo, "public.session_event", "note text")).toBe(1);
    expect(printed(pseudo, "private.media_suppression", "note text")).toBe(1);
    expect(printed(pseudo, "private.boundary_dispute", "note text")).toBe(1);
    expect(
      value(`select name from private.boundary_pointer where source_event_id = '${ev.pointerA}'`),
    ).toBe(ps);
    expect(value(`select note from private.media_suppression where parcel_id = '${parcel}'`)).toBe(
      `${ps} panoramada görünüyor, tel ${ps}`,
    );
    // The longer namesake in the closing note is another person.
    expect(
      sql(`select action, note from private.boundary_dispute where parcel_id = '${parcel}' order by created_at`),
    ).toEqual([
      ["open", `${ps} sınıra itiraz etti`],
      ["close", `${LONGER} ile çözüldü`],
    ]);
    expect(JSON.parse(eventPayload(ev.pointerA))).toEqual({ name: ps, role: "owner" });
    expect(JSON.parse(eventPayload(ev.noteA)).note).toBe(`${ps} sözlü bilgilendirildi, tel ${ps}`);
    expect(auditDetails(audit.leak)).toEqual({ phone: ps });
    // Only string values of A's rows; the uuid holding A's phone digits, the
    // longer word and the key stay.
    expect(auditDetails(audit.inScope)).toEqual({
      order_ref: uuidWithPhone,
      phone: ps,
      reason: "Test Müşterisi ile görüşüldü",
      note: `${ps} aradı`,
      [NAME]: "anahtar",
    });

    const erase = kvkk(["erase", "--subject", a.id, "--request", requests.subject, "--apply"]);
    expect(erase.status, erase.stderr).toBe(0);

    const [fullName, phone, email, consent] = sql(
      `select full_name, coalesce(phone, '-'), coalesce(email, '-'), kvkk_consent::text
       from private.owner_profile where user_id = '${a.id}'`,
    )[0];
    expect([fullName, phone, email, consent]).toEqual([ps, "-", "-", "true"]);
    // V still holds access (H26 item 5): the access note keeps everything but
    // A's own name and phone.
    expect(
      value(`select access_note from private.parcel_detail where parcel_id = '${parcel}'`),
    ).toBe(`Anahtar ${ps} kişisinde, tel ${ps}; ${LONGER} da bilir; gece ${VIEWER_NAME} gelir`);
    expect(value(`select count(*) from public.parcel_access where user_id = '${viewerId}'`)).toBe(
      "1",
    );
    // V's invitation is V's access record: kept, only A's link goes.
    expect(
      sql(`select coalesce(invited_by::text, '-'), full_name from private.viewer_invitation
           where user_id = '${viewerId}'`),
    ).toEqual([["-", VIEWER_NAME]]);
    expect(
      sql(
        `select body, coalesce(created_by::text, '-') from public.question where id = '${question}'`,
      )[0],
    ).toEqual([REDACTED, "-"]);
    expect(value(`select body from public.question_reply where id = '${expertReply}'`)).toBe(
      "Su stresi.",
    );
    // What A wrote as staff belongs to the service record (H25).
    expect(
      sql(
        `select body, created_by::text from public.question_reply where id = '${staffReplyByA}'`,
      )[0],
    ).toEqual(["Uzman notu: sulama artırılmalı.", a.id]);
    expect(
      value(
        `select count(*) from public.question_reply where parcel_id = '${parcel}' and body = ${lit(REDACTED)}`,
      ),
    ).toBe("1");
    expect(value(`select count(*) from public.parcel_access where user_id = '${a.id}'`)).toBe("0");

    expect(untouchable()).toBe(namesakeRows);
    expect(retained()).toBe(keep);
    expect(demoData()).toBe(demoBefore);
    expect(seedOwner()).toBe(seedBefore);

    const rows =
      sql(`select action, coalesce(actor_user_id::text, '-'), details::text from public.audit_event
      where details ->> 'request' = '${requests.subject}' order by created_at`);
    expect(rows.map((r) => r[0])).toEqual([
      "kvkk.pseudonymized",
      "kvkk.pseudonymized",
      "kvkk.erased",
    ]);
    for (const [, actor, details] of rows) {
      expect(actor).toBe("-");
      expect(details).not.toContain(NAME);
      expect(details).not.toContain(aPhone);
      expect(JSON.parse(details)).toMatchObject({ subject_kind: "user", subject_ref: ps });
    }
    expect(JSON.parse(rows[2][2]).counts["private.owner_profile:clear name, phone, email"]).toBe(1);

    // A second run finds nothing left to change.
    const again = kvkk(["erase", "--subject", a.id, "--request", requests.subject]);
    expect(again.status, again.stderr).toBe(0);
    expect(printed(again, "private.owner_profile", "clear name, phone, email")).toBe(0);
  });

  it("co-owner request after the owner's access lapsed (H26 item 6): the owner's parcel data stays", () => {
    // The owner's retained parcel data (H25), the owner holding no access any more.
    sql(`update private.parcel_detail
      set site_contact_name = ${lit("Hasan Usta")}, site_contact_phone = '${POINTER_PHONE}',
          access_note = ${lit("Anahtar kapının yanında")}
      where parcel_id = '${parcel}'`);
    const detailBefore = detailRow();
    const namesakeRows = untouchable();
    const pointerEce = eventPayload(ev.pointerEce);

    const inv = kvkk(["inventory", "--subject", viewerId, "--request", requests.viewer]);
    expect(inv.status, inv.stderr).toBe(0);
    expect(inv.stdout).toMatch(/\n single-word names of the subject\s+\|\s+1\s+\| review/);
    expect(inv.stdout).not.toContain(VIEWER_NAME);

    for (const command of ["pseudonymize", "erase"]) {
      const run = kvkk([
        command,
        "--subject",
        viewerId,
        "--request",
        requests.viewer,
        "--include-notes",
        "--apply",
      ]);
      expect(run.status, run.stderr).toBe(0);
    }
    expect(value(`select count(*) from public.parcel_access where user_id = '${viewerId}'`)).toBe(
      "0",
    );
    expect(
      value(`select count(*) from private.viewer_invitation where user_id = '${viewerId}'`),
    ).toBe("0");
    expect(detailRow()).toBe(detailBefore);
    // "Ece" is a single word: "gece", the uuid groups and the pointer stay.
    expect(eventPayload(ev.pointerEce)).toBe(pointerEce);
    expect(untouchable()).toBe(namesakeRows);
  });
});
