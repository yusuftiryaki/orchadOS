import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  decideRetry,
  formatDayTr,
  portalLink,
  renderLoginCode,
  renderNotification,
  retryDelayMs,
  type Template,
} from "../../../../../supabase/functions/_shared/messaging";

// The Edge Functions' message texts and retry policy (pure TypeScript shared
// with supabase/functions).
const BASE = "https://portal.example.test";
const VARS = { parcel_name: "Örnek Bahçe 1", date: "2026-10-14", path: "/portal/parsel/c0-1" };

describe("templates", () => {
  it("report ready", () => {
    expect(renderNotification("report_ready", VARS, BASE)).toEqual({
      ok: true,
      body: "Örnek Bahçe 1 için 14 Ekim denetim raporunuz hazır: https://portal.example.test/portal/parsel/c0-1",
    });
  });

  it("critical finding", () => {
    const out = renderNotification("critical_finding", VARS, `${BASE}/`);
    expect(out).toEqual({
      ok: true,
      body:
        "Örnek Bahçe 1 için 14 Ekim denetiminde uzmanımız acil bir bulgu onayladı. " +
        "Ayrıntı: https://portal.example.test/portal/parsel/c0-1",
    });
  });

  it("fits in two SMS segments with Turkish characters", () => {
    const longLink = { ...VARS, path: "/portal/parsel/c0000000-0000-4000-8000-000000000001" };
    for (const template of ["report_ready", "critical_finding"]) {
      const out = renderNotification(template, longLink, "https://orchados.vercel.app");
      expect(out.ok && out.body.length).toBeLessThanOrEqual(2 * 153);
    }
  });

  it.each([
    [{ ...VARS, parcel_name: "  " }, "invalid_vars"],
    [{ ...VARS, date: "14.10.2026" }, "invalid_vars"],
    [{ ...VARS, date: "2026-13-01" }, "invalid_vars"],
    [{ ...VARS, path: "https://evil.example/portal" }, "invalid_link"],
    [{ ...VARS, path: "/uzman/ziyaret/x" }, "invalid_link"],
    [{ ...VARS, path: "/portal/../uzman" }, "invalid_link"],
  ])("rejects %j", (vars, error) => {
    expect(renderNotification("report_ready", vars, BASE)).toEqual({ ok: false, error });
  });

  it("rejects an unknown template and a bad base URL", () => {
    expect(renderNotification("welcome", VARS, BASE)).toEqual({
      ok: false,
      error: "unknown_template",
    });
    expect(renderNotification("report_ready", VARS, "")).toEqual({
      ok: false,
      error: "invalid_link",
    });
    expect(portalLink("javascript:alert(1)", "/portal/x")).toBeNull();
  });

  it("formats the day in Turkish", () => {
    expect(formatDayTr("2026-01-05")).toBe("5 Ocak");
    expect(formatDayTr("2026-08-31")).toBe("31 Ağustos");
    expect(formatDayTr("2026-10-14T00:00")).toBeNull();
  });

  it("login code", () => {
    expect(renderLoginCode("123456")).toBe(
      "orchadOS giriş kodunuz: 123456. Kodu kimseyle paylaşmayın.",
    );
  });
});

describe("account templates", () => {
  const ID = "c0000000-0000-4000-8000-000000000001";
  const cases = [
    [
      "quote_ready",
      "T-2026-000123",
      `/portal/teklif/${ID}`,
      `orchadOS teklifiniz (T-2026-000123) hazır. İnceleyip onaylayabilirsiniz: ${BASE}/portal/teklif/${ID}`,
    ],
    [
      "application_rejected",
      "B-2026-000123",
      `/portal/basvuru/${ID}`,
      `B-2026-000123 numaralı başvurunuz sonuçlandı. Ayrıntı: ${BASE}/portal/basvuru/${ID}`,
    ],
    [
      "payment_received",
      "M-2026-000123",
      `/portal/odeme/${ID}`,
      `M-2026-000123 numaralı ödemeniz alındı, teşekkür ederiz. Makbuz: ${BASE}/portal/odeme/${ID}`,
    ],
    [
      "refund_completed",
      "I-2026-000123",
      `/portal/odeme/${ID}`,
      "I-2026-000123 numaralı iadeniz yapıldı; hesabınıza yansıması bankanıza göre birkaç gün " +
        `sürebilir: ${BASE}/portal/odeme/${ID}`,
    ],
    [
      "payment_reminder",
      "S-2026-000123",
      `/portal/siparis/${ID}`,
      `orchadOS: S-2026-000123 numaralı siparişinizde bir ödemenin son günü yaklaştı. Tarih ve tutar portalınızda: ${BASE}/portal/siparis/${ID} Ödeme yapılmadan ilgili hizmet planlanmaz; faiz ya da ek ücret alınmaz.`,
    ],
    [
      "contract_ready",
      "S-2026-000123",
      "/portal/hesap/sozlesmeler",
      "orchadOS: S-2026-000123 numaralı siparişinizin sözleşmesi ve ön bilgilendirme formu portalınızda: " +
        `${BASE}/portal/hesap/sozlesmeler`,
    ],
    [
      "addon_order_closed",
      "S-2026-000123",
      `/portal/siparis/${ID}`,
      "orchadOS: S-2026-000123 numaralı ek siparişiniz, hizmet dönemi kapandığı için iptal edildi. " +
        `Ödediğiniz tutar 14 gün içinde aynı yöntemle, masrafsız iade edilir: ${BASE}/portal/siparis/${ID}`,
    ],
  ] as const;

  it.each(cases)("%s", (template, ref, path, body) => {
    expect(renderNotification(template, { ref, path }, BASE)).toEqual({ ok: true, body });
  });

  it("fit in two SMS segments", () => {
    for (const [template, ref, path] of cases) {
      const out = renderNotification(template, { ref, path }, "https://orchados.vercel.app");
      expect(out.ok && out.body.length).toBeLessThanOrEqual(2 * 153);
    }
  });

  it.each([
    [{ ref: "S-2026-000123", path: `/portal/teklif/${ID}` }, "invalid_vars"],
    [{ ref: "T-26-1", path: `/portal/teklif/${ID}` }, "invalid_vars"],
    [{ path: `/portal/teklif/${ID}` }, "invalid_vars"],
    [{ ref: "T-2026-000123", path: "https://evil.example/portal" }, "invalid_link"],
    [{ ref: "T-2026-000123" }, "invalid_link"],
  ])("rejects %j", (vars, error) => {
    expect(renderNotification("quote_ready", vars, BASE)).toEqual({ ok: false, error });
  });

  it("report templates still need the parcel and the day", () => {
    expect(
      renderNotification("report_ready", { ref: "T-2026-000123", path: "/portal/x" }, BASE),
    ).toEqual({
      ok: false,
      error: "invalid_vars",
    });
  });
});

describe("garden templates", () => {
  const ID = "c0000000-0000-4000-8000-000000000001";
  const path = `/portal/parsel/${ID}`;
  const link = `${BASE}${path}`;
  const ref = "C-2026-000123";
  const cases = [
    [
      "garden_removal_scheduled",
      `orchadOS: Nizip Bahçesi adlı bahçenizin hizmetten çıkışı planlandı (${ref}). Çıkış tarihi ve ayrıntılar: ${link}`,
      `orchadOS: bahçenizin hizmetten çıkışı planlandı (${ref}). Çıkış tarihi ve ayrıntılar: ${link}`,
    ],
    [
      "garden_removal_rescheduled",
      `orchadOS: Nizip Bahçesi adlı bahçenizin hizmetten çıkış tarihi değişti (${ref}). Yeni tarih ve ayrıntılar: ${link}`,
      `orchadOS: bahçenizin hizmetten çıkış tarihi değişti (${ref}). Yeni tarih ve ayrıntılar: ${link}`,
    ],
    [
      "garden_removal_cancelled",
      `orchadOS: Nizip Bahçesi adlı bahçeniz için çıkarma işlemi iptal edildi (${ref}); bahçeniz hizmette kalıyor. Ayrıntılar: ${link}`,
      `orchadOS: bahçeniz için çıkarma işlemi iptal edildi (${ref}); bahçeniz hizmette kalıyor. Ayrıntılar: ${link}`,
    ],
    [
      "garden_removal_completed",
      `orchadOS: Nizip Bahçesi adlı bahçeniz hizmetten çıkarıldı (${ref}). Raporlarınız silinmedi; erişim süresi ve iade bilgisi: ${link}`,
      `orchadOS: bahçeniz hizmetten çıkarıldı (${ref}). Raporlarınız silinmedi; erişim süresi ve iade bilgisi: ${link}`,
    ],
    [
      "garden_access_ending",
      `orchadOS: hizmetten çıkan Nizip Bahçesi adlı bahçenizin raporlarına erişim 7 gün sonra kapanacak (${ref}). Raporları indirmek için: ${link}`,
      `orchadOS: hizmetten çıkan bahçenizin raporlarına erişim 7 gün sonra kapanacak (${ref}). Raporları indirmek için: ${link}`,
    ],
    [
      "withdrawal_received",
      `orchadOS: Nizip Bahçesi adlı bahçeniz için cayma bildiriminiz alındı (${ref}). İade ve ayrıntılar: ${link}`,
      `orchadOS: bahçeniz için cayma bildiriminiz alındı (${ref}). İade ve ayrıntılar: ${link}`,
    ],
  ] as const;

  it.each(cases)("%s with the parcel name", (template, withName) => {
    expect(renderNotification(template, { ref, path, parcel_name: "Nizip Bahçesi" }, BASE)).toEqual(
      {
        ok: true,
        body: withName,
      },
    );
  });

  it.each(cases)("%s without the parcel name", (template, _withName, withoutName) => {
    expect(renderNotification(template, { ref, path }, BASE)).toEqual({
      ok: true,
      body: withoutName,
    });
    expect(renderNotification(template, { ref, path, parcel_name: "  " }, BASE)).toEqual({
      ok: true,
      body: withoutName,
    });
  });

  it("takes only removal numbers (C-…) and portal links", () => {
    expect(
      renderNotification("garden_removal_completed", { ref: "S-2026-000123", path }, BASE),
    ).toEqual({ ok: false, error: "invalid_vars" });
    expect(
      renderNotification(
        "garden_removal_completed",
        { ref, path: "https://evil.example/portal" },
        BASE,
      ),
    ).toEqual({ ok: false, error: "invalid_link" });
    expect(renderNotification("garden_removal_completed", { ref, path: "/portal" }, BASE)).toEqual({
      ok: true,
      body: `orchadOS: bahçeniz hizmetten çıkarıldı (${ref}). Raporlarınız silinmedi; erişim süresi ve iade bilgisi: ${BASE}/portal`,
    });
    expect(renderNotification("garden_removal_completed", { ref, path: "/portalx" }, BASE)).toEqual(
      {
        ok: false,
        error: "invalid_link",
      },
    );
  });

  it("fit in two SMS segments without the name", () => {
    for (const [template] of cases) {
      const out = renderNotification(template, { ref, path }, "https://orchados.vercel.app");
      expect(out.ok && out.body.length).toBeLessThanOrEqual(2 * 153);
    }
  });
});

describe("retry", () => {
  const now = new Date("2026-10-21T10:00:00Z");

  it("waits 1, 4, 16, 60 minutes", () => {
    expect([1, 2, 3, 4, 5].map((n) => retryDelayMs(n) / 60_000)).toEqual([1, 4, 16, 60, 60]);
  });

  it("retries temporary errors until the last attempt", () => {
    expect(decideRetry(1, false, now)).toEqual({
      outcome: "retry",
      retryAt: new Date("2026-10-21T10:01:00Z"),
    });
    expect(decideRetry(3, false, now)).toEqual({
      outcome: "retry",
      retryAt: new Date("2026-10-21T10:16:00Z"),
    });
    expect(decideRetry(MAX_ATTEMPTS, false, now)).toEqual({ outcome: "failed" });
  });

  it("fails permanent errors at once", () => {
    expect(decideRetry(1, true, now)).toEqual({ outcome: "failed" });
  });
});

// docs/hukuk/kararlar.md H06: service messages go out without İYS consent only
// as long as they carry no promotion. The record lists every template (the
// type makes a new one fail to compile here) with the ref it is rendered with.
const EVERY_TEMPLATE: Record<Template, string | null> = {
  report_ready: null,
  critical_finding: null,
  quote_ready: "T-2026-000001",
  application_rejected: "B-2026-000001",
  payment_received: "M-2026-000001",
  refund_completed: "I-2026-000001",
  payment_reminder: "S-2026-000001",
  garden_removal_scheduled: "C-2026-000001",
  garden_removal_rescheduled: "C-2026-000001",
  garden_removal_cancelled: "C-2026-000001",
  garden_removal_completed: "C-2026-000001",
  garden_access_ending: "C-2026-000001",
  withdrawal_received: "C-2026-000001",
  contract_ready: "S-2026-000001",
  addon_order_closed: "S-2026-000001",
  viewer_invited: null,
  visit_scheduled: null,
  garden_transfer_reports: "C-2026-000001",
  service_scheduled: "H-2026-000001",
  service_completed: "H-2026-000001",
  service_cancelled: "H-2026-000001",
};

describe("service messages carry no promotion", () => {
  const PROMOTION = /kampanya|indirim|fırsat|avantaj|hediye|yeni paket|tanıtım/i;

  it.each(Object.entries(EVERY_TEMPLATE))("%s", (template, ref) => {
    const out = renderNotification(template, { ...VARS, ...(ref ? { ref } : {}) }, BASE);
    expect(out.ok).toBe(true);
    expect(out.ok && out.body).not.toMatch(PROMOTION);
  });

  it("login code", () => {
    expect(renderLoginCode("123456")).not.toMatch(PROMOTION);
  });
});

describe("co-owner invitation (T15, H32)", () => {
  it("names the parcel, says who gave the number and links the notice and the portal", () => {
    const out = renderNotification(
      "viewer_invited",
      { parcel_name: "Kuzey Bahçe", path: "/portal" },
      "https://portal.example/app",
    );
    expect(out).toEqual({
      ok: true,
      body: "orchadOS: Kuzey Bahçe bahçesinin sahibi sizi raporları görmeniz için davet etti; numaranızı bize o verdi. Kişisel verileriniz: https://portal.example/kvkk Giriş: https://portal.example/app/portal",
    });
  });

  it("needs the parcel name and a portal path", () => {
    expect(renderNotification("viewer_invited", { path: "/portal" }, BASE)).toEqual({
      ok: false,
      error: "invalid_vars",
    });
    expect(renderNotification("viewer_invited", { parcel_name: "X", path: "/kvkk" }, BASE)).toEqual(
      { ok: false, error: "invalid_link" },
    );
  });
});

describe("visit date notice (T07, H01, H15)", () => {
  it("gives the day, the notice for people in the garden and both links", () => {
    expect(renderNotification("visit_scheduled", VARS, "https://portal.example/app")).toEqual({
      ok: true,
      body: "orchadOS: Örnek Bahçe 1 adlı bahçenizin denetim ziyareti 14 Ekim günü yapılacak. Bahçede çalışan ya da bulunacak kişilere görüntü alınacağını iletmenizi rica ederiz; bilgi: https://portal.example/bahcede-bulunanlar Erteleme ve ayrıntı: https://portal.example/app/portal/parsel/c0-1",
    });
  });

  it("works without the parcel name and needs the day and a portal path", () => {
    const out = renderNotification(
      "visit_scheduled",
      { date: "2026-10-14", path: "/portal" },
      BASE,
    );
    expect(out.ok && out.body).toMatch(/^orchadOS: bahçenizin denetim ziyareti 14 Ekim günü/);
    expect(renderNotification("visit_scheduled", { path: "/portal" }, BASE)).toEqual({
      ok: false,
      error: "invalid_vars",
    });
    expect(
      renderNotification("visit_scheduled", { date: "2026-10-14", path: "/kvkk" }, BASE),
    ).toEqual({ ok: false, error: "invalid_link" });
  });
});

describe("transfer: download your reports (T23, H22)", () => {
  it("names the removal, the exit-day access end and the copy on request", () => {
    expect(
      renderNotification(
        "garden_transfer_reports",
        { ref: "C-2026-000007", path: "/portal/parsel/p1", parcel_name: "Kuzey" },
        BASE,
      ),
    ).toEqual({
      ok: true,
      body: "orchadOS: Kuzey adlı bahçenizin devir nedeniyle hizmetten çıkışı planlandı (C-2026-000007). Raporlara erişim çıkış gününde kapanır; o güne kadar raporlarınızı indirebilirsiniz, sonrasında kopyası talebiniz üzerine verilir: https://portal.example.test/portal/parsel/p1",
    });
  });
});

describe("service requests (IP15, H06 service messages)", () => {
  const vars = { ref: "H-2026-000003", date: "2027-04-14", path: "/portal/hizmetler/r1", parcel_name: "Kuzey" };

  it("scheduled: number, day and the free cancellation until the day before", () => {
    expect(renderNotification("service_scheduled", vars, BASE)).toEqual({
      ok: true,
      body: "orchadOS: Kuzey adlı bahçenizde ot biçme işi (H-2026-000003) 14 Nisan günü için planlandı. Bir gün öncesine kadar ücretsiz iptal edebilirsiniz: https://portal.example.test/portal/hizmetler/r1",
    });
  });

  it("completed and cancelled link the request; no amount anywhere", () => {
    const done = renderNotification("service_completed", vars, BASE);
    expect(done.ok && done.body).toMatch(/tamamlandı. Öncesi ve sonrası fotoğrafları portalınızda/);
    const cancelled = renderNotification("service_cancelled", { ...vars, parcel_name: undefined }, BASE);
    expect(cancelled.ok && cancelled.body).toMatch(/^orchadOS: bahçenizde ot biçme talebiniz \(H-2026-000003\) iptal edildi/);
    for (const out of [done, cancelled]) expect(out.ok && out.body).not.toMatch(/TL|₺/);
  });

  it("needs an H- number, the day when scheduled and a portal path", () => {
    expect(renderNotification("service_scheduled", { ...vars, ref: "T-2026-000003" }, BASE)).toEqual({
      ok: false,
      error: "invalid_vars",
    });
    expect(renderNotification("service_scheduled", { ...vars, date: undefined }, BASE)).toEqual({
      ok: false,
      error: "invalid_vars",
    });
    expect(renderNotification("service_completed", { ...vars, path: "/kvkk" }, BASE)).toEqual({
      ok: false,
      error: "invalid_link",
    });
  });
});
