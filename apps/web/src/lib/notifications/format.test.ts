import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/database.types";
import { t } from "@/lib/i18n";
import { errorLabel, formatDateTime } from "./format";

describe("notification labels", () => {
  it.each([
    [null, null],
    ["no_phone", "Alıcının telefon numarası yok"],
    ["provider_error:30", "Sağlayıcı hatası (30)"],
    ["provider_http:503", "Sağlayıcı hatası (503)"],
    ["record_500", "record_500"],
  ])("%s -> %s", (code, label) => {
    expect(errorLabel(code)).toBe(label);
  });

  it("labels every status, template and channel", () => {
    const enums = Constants.public.Enums;
    for (const s of enums.notification_status) expect(t.notifications.status[s]).toBeTruthy();
    for (const s of enums.notification_template) expect(t.notifications.template[s]).toBeTruthy();
    for (const s of enums.notification_channel) expect(t.notifications.channel[s]).toBeTruthy();
  });

  it("shows Turkey time", () => {
    expect(formatDateTime("2026-10-13T22:30:00Z")).toContain("01:30");
  });
});
