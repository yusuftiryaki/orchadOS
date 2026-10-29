import { describe, expect, it } from "vitest";
import { boHref, pick, readBoResult } from "./urls";

describe("boHref", () => {
  it("builds paths with filters and results", () => {
    expect(boHref.applications()).toBe("/operasyon/basvuru");
    expect(boHref.applications({ durum: "submitted" })).toBe("/operasyon/basvuru?durum=submitted");
    expect(boHref.order("o1", { notice: "payment_recorded" })).toBe(
      "/operasyon/siparis/o1?bilgi=payment_recorded",
    );
    expect(boHref.payment("p1", { error: "payments_unreachable" })).toBe(
      "/operasyon/odeme/p1?hata=payments_unreachable",
    );
    expect(boHref.newQuote({ sahip: "s1" })).toBe("/operasyon/teklif/yeni?sahip=s1");
    expect(boHref.customers({ kaynak: "self" })).toBe("/operasyon/sahip?kaynak=self");
    expect(boHref.packageForm()).toBe("/operasyon/fiyat/paket/yeni");
    expect(boHref.receipt("p1")).toBe("/makbuz/p1");
  });

  it("keeps the org of a multi-org ops user", () => {
    expect(boHref.settings({ notice: "settings_saved" }, "o2")).toBe(
      "/operasyon/ayarlar?org=o2&bilgi=settings_saved",
    );
    expect(boHref.settings()).toBe("/operasyon/ayarlar");
    expect(boHref.prices({ notice: "package_saved" }, "o2")).toBe(
      "/operasyon/fiyat?org=o2&bilgi=package_saved",
    );
    expect(boHref.packageForm(undefined, "o2")).toBe("/operasyon/fiyat/paket/yeni?org=o2");
    expect(boHref.packageForm("p1", "o2")).toBe("/operasyon/fiyat/paket/p1");
    expect(boHref.audit({ org: "o2", tur: "order" })).toBe(
      "/operasyon/denetim-kaydi?org=o2&tur=order",
    );
  });
});

describe("IP14 routes", () => {
  it("builds the removal queue, a removal and the add-on quote mode", () => {
    expect(boHref.removals()).toBe("/operasyon/cikarma");
    expect(boHref.removals({ durum: "completed" })).toBe("/operasyon/cikarma?durum=completed");
    expect(boHref.removal("r1")).toBe("/operasyon/cikarma/r1");
    expect(boHref.removal("r1", { notice: "removal_completed" })).toBe(
      "/operasyon/cikarma/r1?bilgi=removal_completed",
    );
    expect(boHref.newQuote({ ek: "b1" })).toBe("/operasyon/teklif/yeni?ek=b1");
    expect(boHref.newQuote({ ek: "b1", siparis: "o1" })).toBe(
      "/operasyon/teklif/yeni?ek=b1&siparis=o1",
    );
    expect(boHref.newQuote({ siparis: "o1" })).toBe("/operasyon/teklif/yeni?siparis=o1");
  });

  it("reads back the IP14 notices and error codes", () => {
    for (const notice of [
      "garden_linked",
      "garden_unlinked",
      "garden_withdrawn",
      "removal_requested",
      "removal_scheduled",
      "removal_completed",
      "removal_cancelled",
    ]) {
      expect(readBoResult({ bilgi: notice }).notice).toBe(notice);
    }
    for (const error of ["parcel_order_pending", "removal_not_due", "garden_changes_closed"]) {
      expect(readBoResult({ hata: error }).error).toBe(error);
    }
  });
});

describe("readBoResult", () => {
  it("keeps only known codes", () => {
    expect(readBoResult({ bilgi: "quote_issued", hata: "refund_not_open" })).toEqual({
      notice: "quote_issued",
      error: "refund_not_open",
    });
    expect(readBoResult({ bilgi: "<script>", hata: "anything" })).toEqual({
      notice: undefined,
      error: undefined,
    });
    expect(readBoResult({ hata: ["payments_unreachable", "x"] }).error).toBe(
      "payments_unreachable",
    );
  });

  it("pick keeps allowed filter values", () => {
    expect(pick("active", ["active", "cancelled"] as const)).toBe("active");
    expect(pick("drop table", ["active"] as const)).toBeNull();
    expect(pick(undefined, ["active"] as const)).toBeNull();
  });
});
