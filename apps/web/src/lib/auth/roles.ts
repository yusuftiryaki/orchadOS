import type { Database } from "@/lib/database.types";

export type OrgRole = Database["public"]["Enums"]["org_role"];
export type ParcelRole = Database["public"]["Enums"]["parcel_role"];

export interface UserRoles {
  orgRoles: OrgRole[];
  parcelRoles: ParcelRole[];
}

// URL segment of each section, in the order they are offered to the user.
export const SECTIONS = ["portal", "uzman", "ofis", "operasyon"] as const;
export type Section = (typeof SECTIONS)[number];

// Which roles open which section. Org roles come from `membership`, parcel
// roles from `parcel_access`. Data visibility inside a section is still
// decided by row level security, not by this table.
export const SECTION_ACCESS: Record<Section, { org: OrgRole[]; parcel: ParcelRole[] }> = {
  portal: { org: [], parcel: ["owner", "viewer"] },
  uzman: { org: ["expert"], parcel: [] },
  ofis: { org: ["field_staff", "ops"], parcel: [] },
  operasyon: { org: ["ops"], parcel: [] },
};

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

export function canAccessSection(roles: UserRoles, section: Section): boolean {
  const rule = SECTION_ACCESS[section];
  return (
    rule.org.some((role) => roles.orgRoles.includes(role)) ||
    rule.parcel.some((role) => roles.parcelRoles.includes(role))
  );
}

export function accessibleSections(roles: UserRoles): Section[] {
  return SECTIONS.filter((section) => canAccessSection(roles, section));
}

// Landing section after login: the first one the user can open, or null.
export function defaultSection(roles: UserRoles): Section | null {
  return accessibleSections(roles)[0] ?? null;
}
