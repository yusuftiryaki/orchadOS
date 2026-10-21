import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/database.types";
import { tr } from "@/lib/i18n/tr";

// Every value of the inventory enums shown in the UI has a Turkish label.
describe("inventory messages", () => {
  const enums = Constants.public.Enums;

  it.each([
    ["verification_reason", enums.verification_reason, tr.inventory.reasons],
    ["verification_status", enums.verification_status, tr.inventory.itemStatus],
    ["zone_kind", enums.zone_kind, tr.inventory.zoneKinds],
    ["boundary_source", enums.boundary_source, tr.inventory.boundarySource],
  ] as const)("labels every %s value", (_name, values, labels) => {
    for (const value of values) {
      expect(labels[value as keyof typeof labels]).toBeTruthy();
    }
  });

  it("explains every approval error", () => {
    for (const error of [
      "forbidden",
      "session_invalid",
      "already_published",
      "inventory_incomplete",
      "write_failed",
    ] as const) {
      expect(tr.inventory.expert.approve.errors[error]).toBeTruthy();
    }
  });
});
