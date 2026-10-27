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
    expect(boHref.customers({ q: "ali veli", kaynak: "self" })).toBe(
      "/operasyon/sahip?q=ali+veli&kaynak=self",
    );
    expect(boHref.packageForm()).toBe("/operasyon/fiyat/paket/yeni");
    expect(boHref.receipt("p1")).toBe("/makbuz/p1");
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
