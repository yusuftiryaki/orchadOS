import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveViewerInvitation,
  listViewerInvitations,
  rejectViewerInvitation,
} from "@/lib/operations/invitations";
import {
  cancelInvitation,
  inviteViewer,
  loadParcelViewers,
  removeViewer,
} from "@/lib/portal/viewers";
import type { Client } from "@/lib/supabase/types";
import { purgeViewerInvitations } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";

// The owner invites a co-owner from the portal; ops opens the phone account
// with the KVKK consent and grants viewer access, or rejects; the owner sees
// the outcome masked and removes a viewer. Viewers and staff cannot invite.

const suffix = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
const PHONE = `+90554${suffix}`;
const PHONE_REJECTED = `+90553${suffix}`;

let admin: Client;
let owner: Client;
let ownerId: string;
let viewer: Client;
let ops: Client;
let field: Client;
let createdUser: string | null = null;

const cleanup = () => purgeViewerInvitations([PHONE, PHONE_REJECTED]);

beforeAll(async () => {
  admin = serviceClient();
  const o = await signIn("owner");
  owner = o.client;
  ownerId = o.userId;
  [viewer, ops, field] = (
    await Promise.all([signIn("viewer"), signIn("ops"), signIn("field")])
  ).map((s) => s.client);
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (createdUser) await admin.auth.admin.deleteUser(createdUser);
});

describe("co-owner invitations", () => {
  it("the owner invites a co-owner; the list shows the invitation masked", async () => {
    // T15: the seed org asks the owner's declaration (coowner_notice_flow_enabled).
    expect(
      await inviteViewer(owner, SEED.parcel, "Test Hissedar", PHONE.replace("+90", "0")),
    ).toEqual({ ok: false, error: "declaration_required" });
    expect(
      await inviteViewer(owner, SEED.parcel, "Test Hissedar", PHONE.replace("+90", "0"), true),
    ).toEqual({
      ok: true,
    });
    const list = await loadParcelViewers(owner, SEED.parcel, ownerId);
    expect(list.isOwner).toBe(true);
    const entry = list.entries.find((e) => e.fullName === "Test Hissedar");
    expect(entry).toMatchObject({ kind: "invitation", status: "pending" });
    expect(entry?.phone).toBe(`••• ••• •• ${PHONE.slice(-2)}`);
    expect(JSON.stringify(list)).not.toContain(PHONE.slice(3));
  });

  it("viewers and field staff cannot invite", async () => {
    expect(await inviteViewer(viewer, SEED.parcel, "X Y", "05321112233")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await inviteViewer(field, SEED.parcel, "X Y", "05321112233")).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("ops sees the full phone and opens the account with the consent", async () => {
    const open = await listViewerInvitations(ops, [SEED.org]);
    const invitation = open.find((i) => i.phone === PHONE);
    expect(invitation).toMatchObject({ fullName: "Test Hissedar", parcelName: "Örnek Bahçe 1" });
    const result = await approveViewerInvitation(
      ops,
      { id: invitation!.id, orgId: SEED.org },
      {
        fullName: "Test Hissedar",
        phone: PHONE,
        email: null,
        contactPreference: "sms",
        kvkkConsent: true,
        kvkkConsentAt: "2026-10-22T09:00:00Z",
        kvkkTextVersion: "kvkk-v0",
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdUser = result.value.userId;
    expect(result.value.profileCreated).toBe(true);

    const access = await admin
      .from("parcel_access")
      .select("role")
      .eq("parcel_id", SEED.parcel)
      .eq("user_id", createdUser);
    expect(access.data).toEqual([{ role: "viewer" }]);
  });

  it("the owner sees the new viewer and removes them", async () => {
    const list = await loadParcelViewers(owner, SEED.parcel, ownerId);
    const entry = list.entries.find((e) => e.fullName === "Test Hissedar");
    expect(entry).toMatchObject({ kind: "viewer", status: "active" });
    expect(await removeViewer(viewer, SEED.parcel, entry!.id)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await removeViewer(owner, SEED.parcel, entry!.id)).toEqual({ ok: true });
    const after = await loadParcelViewers(owner, SEED.parcel, ownerId);
    expect(after.entries.some((e) => e.fullName === "Test Hissedar")).toBe(false);
  });

  it("a rejected invitation shows as such; an open one can be withdrawn", async () => {
    expect(await inviteViewer(owner, SEED.parcel, "Reddedilen", PHONE_REJECTED, true)).toEqual({
      ok: true,
    });
    const open = await listViewerInvitations(ops, [SEED.org]);
    const id = open.find((i) => i.phone === PHONE_REJECTED)!.id;
    expect(await rejectViewerInvitation(field, id)).toEqual({ ok: false, error: "forbidden" });
    expect(await rejectViewerInvitation(ops, id)).toEqual({ ok: true, value: undefined });
    const list = await loadParcelViewers(owner, SEED.parcel, ownerId);
    expect(list.entries.find((e) => e.fullName === "Reddedilen")?.status).toBe("rejected");

    expect(await inviteViewer(owner, SEED.parcel, "Geri alınan", PHONE_REJECTED, true)).toEqual({
      ok: true,
    });
    const pending = (await loadParcelViewers(owner, SEED.parcel, ownerId)).entries.find(
      (e) => e.fullName === "Geri alınan",
    );
    expect(await cancelInvitation(owner, pending!.id)).toEqual({ ok: true });
    expect(await cancelInvitation(owner, pending!.id)).toEqual({ ok: false, error: "not_found" });
  });
});
