import { describe, expect, it } from "vitest";
import {
  accessibleSections,
  canAccessSection,
  defaultSection,
  isSection,
  SECTIONS,
  type UserRoles,
} from "./roles";

const roles = (orgRoles: UserRoles["orgRoles"], parcelRoles: UserRoles["parcelRoles"] = []) => ({
  orgRoles,
  parcelRoles,
});

describe("section access", () => {
  it.each([
    ["owner", roles([], ["owner"]), ["portal"]],
    ["viewer", roles([], ["viewer"]), ["portal"]],
    ["field_staff", roles(["field_staff"]), ["ofis"]],
    ["expert", roles(["expert"]), ["uzman"]],
    ["ops", roles(["ops"]), ["ofis", "operasyon"]],
    ["expert + owner", roles(["expert"], ["owner"]), ["portal", "uzman"]],
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
  });

  it("recognises section slugs", () => {
    expect(isSection("uzman")).toBe(true);
    expect(isSection("admin")).toBe(false);
  });
});
