import { describe, expect, it } from "vitest";
import {
  accessibleSections,
  canAccessSection,
  defaultSection,
  isSection,
  SECTION_ACCESS,
  SECTIONS,
  type UserRoles,
} from "./roles";

const roles = (
  orgRoles: UserRoles["orgRoles"],
  parcelRoles: UserRoles["parcelRoles"] = [],
  customer = false,
): UserRoles => ({ orgRoles, parcelRoles, customer });

describe("section access", () => {
  it.each([
    ["owner", roles([], ["owner"]), ["portal"]],
    ["viewer", roles([], ["viewer"]), ["portal"]],
    ["field_staff", roles(["field_staff"]), ["ofis"]],
    ["expert", roles(["expert"]), ["uzman"]],
    ["ops", roles(["ops"]), ["ofis", "operasyon"]],
    ["expert + owner", roles(["expert"], ["owner"]), ["portal", "uzman"]],
    ["customer without parcels", roles([], [], true), ["portal"]],
    ["ops + customer", roles(["ops"], [], true), ["portal", "ofis", "operasyon"]],
    ["no roles", roles([]), []],
  ])("%s opens %j", (_label, userRoles, expected) => {
    expect(accessibleSections(userRoles)).toEqual(expected);
    for (const section of SECTIONS) {
      expect(canAccessSection(userRoles, section)).toBe(expected.includes(section));
    }
  });

  it("lands on the first accessible section", () => {
    expect(defaultSection(roles(["ops"]))).toBe("ofis");
    expect(defaultSection(roles(["expert"], ["viewer"]))).toBe("portal");
    expect(defaultSection(roles([]))).toBeNull();
    expect(defaultSection(roles([], [], true))).toBe("portal");
  });

  it("opens only the portal for the customer flag", () => {
    for (const section of SECTIONS) {
      expect(Boolean(SECTION_ACCESS[section].customer)).toBe(section === "portal");
    }
  });

  it("recognises section slugs", () => {
    expect(isSection("uzman")).toBe(true);
    expect(isSection("admin")).toBe(false);
  });
});
