import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/database.types";
import { SECTIONS } from "@/lib/auth/roles";
import { tr } from "./tr";

// Every database enum value shown in the UI needs a Turkish label.
describe("Turkish messages", () => {
  const enums = Constants.public.Enums;

  it.each([
    ["parcel_status", enums.parcel_status, tr.parcels.status],
    ["slot_kind", enums.slot_kind, tr.tree.values.slotKind],
    ["tree_sex", enums.tree_sex, tr.tree.values.sex],
    ["graft_status", enums.graft_status, tr.tree.values.graft],
    ["age_class", enums.age_class, tr.tree.values.ageClass],
    ["tree_status", enums.tree_status, tr.tree.values.status],
    ["health_class", enums.health_class, tr.tree.values.health],
    ["session_status", enums.session_status, tr.office.sessionStatus],
  ] as const)("labels every %s value", (_name, values, labels) => {
    for (const value of values) {
      expect(labels[value as keyof typeof labels]).toBeTruthy();
    }
  });

  it("names every section", () => {
    for (const section of SECTIONS) expect(tr.sections[section]).toBeTruthy();
  });
});
