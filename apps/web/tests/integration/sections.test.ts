import { describe, expect, it } from "vitest";
import { loadUserRoles } from "@/lib/auth/load-roles";
import { accessibleSections, canAccessSection, SECTIONS, type Section } from "@/lib/auth/roles";
import { signIn, type UserKey } from "./fixtures";

// Roles are read from membership / parcel_access in the database, then mapped
// to sections exactly as the section layouts do.

// Owner and viewer both have a seed owner_profile; field and expert do not.
const EXPECTED_CUSTOMER: Record<UserKey, boolean> = {
  owner: true,
  viewer: true,
  field: false,
  expert: false,
  ops: false,
};

const EXPECTED_SECTIONS: Record<UserKey, Section[]> = {
  owner: ["portal"],
  viewer: ["portal"],
  field: ["ofis"],
  expert: ["uzman"],
  ops: ["ofis", "operasyon"],
};

describe("section access from database roles", () => {
  it.each(Object.entries(EXPECTED_SECTIONS) as [UserKey, Section[]][])(
    "%s opens %j and nothing else",
    async (user, expected) => {
      const { client, userId } = await signIn(user);
      const roles = await loadUserRoles(client, userId);
      expect(accessibleSections(roles)).toEqual(expected);
      expect(roles.customer).toBe(EXPECTED_CUSTOMER[user]);
      for (const section of SECTIONS.filter((s) => !expected.includes(s))) {
        expect(canAccessSection(roles, section)).toBe(false);
      }
    },
  );

  it("ops reads only its own role rows, not the whole org's", async () => {
    // ops may read every membership row of the org (RLS); the user filter
    // keeps other users' roles out of the session.
    const { client, userId } = await signIn("ops");
    const all = await client.from("membership").select("user_id");
    expect(new Set(all.data?.map((r) => r.user_id)).size).toBeGreaterThan(1);
    expect(await loadUserRoles(client, userId)).toEqual({
      orgRoles: ["ops"],
      parcelRoles: [],
      customer: false,
    });
  });
});
