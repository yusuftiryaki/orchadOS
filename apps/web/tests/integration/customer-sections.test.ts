import { describe, expect, it } from "vitest";
import { loadUserRoles } from "@/lib/auth/load-roles";
import { accessibleSections, defaultSection } from "@/lib/auth/roles";
import { CUSTOMER, signInCustomer } from "./fixtures";

// The self sign-up customer of the seed (no parcel yet) opens the portal
// through the owner profile alone (IP12, docs/musteri-yonetimi.md §9).
describe("customer section access", () => {
  it("the seed customer opens the portal and nothing else", async () => {
    const { client, userId } = await signInCustomer();
    expect(userId).toBe(CUSTOMER.id);
    const roles = await loadUserRoles(client, userId);
    expect(roles).toEqual({ orgRoles: [], parcelRoles: [], customer: true });
    expect(accessibleSections(roles)).toEqual(["portal"]);
    expect(defaultSection(roles)).toBe("portal");
  });
});
