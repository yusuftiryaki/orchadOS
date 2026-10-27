import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FakeCheckoutPage from "./page";

const TOKEN = "fake_11111111-1111-4111-8111-111111111111_abcdef0123456789";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/server", () => ({ connection: async () => {} }));

async function render(query: Record<string, string>) {
  return renderToStaticMarkup(await FakeCheckoutPage({ searchParams: Promise.resolve(query) }));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});

afterEach(() => vi.unstubAllEnvs());

describe("/odeme/sahte", () => {
  it("does not exist without PAYMENT_FAKE_CHECKOUT=1", async () => {
    vi.stubEnv("PAYMENT_FAKE_CHECKOUT", "");
    await expect(render({ token: TOKEN, tutar: "12000.00" })).rejects.toThrow("NEXT_NOT_FOUND");
    vi.stubEnv("PAYMENT_FAKE_CHECKOUT", "true");
    await expect(render({ token: TOKEN, tutar: "12000.00" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("posts the token and an outcome to payment-callback", async () => {
    vi.stubEnv("PAYMENT_FAKE_CHECKOUT", "1");
    const html = await render({ token: TOKEN, tutar: "12000.00" });
    expect(html).toContain('action="http://127.0.0.1:54321/functions/v1/payment-callback"');
    expect(html).toContain('method="post"');
    expect(html).toContain(`name="token" value="${TOKEN}"`);
    expect(html).toContain("12000.00 TL");
    for (const [value, label] of [
      ["success", "Ödemeyi onayla"],
      ["failure", "Kart reddedildi"],
      ["review", "İncelemeye düşür"],
    ]) {
      expect(html).toMatch(
        new RegExp(`<button[^>]*value="${value}" name="outcome">${label}</button>`),
      );
    }
  });

  it("shows no form for a malformed link", async () => {
    vi.stubEnv("PAYMENT_FAKE_CHECKOUT", "1");
    const html = await render({ token: "<script>", tutar: "12000.00" });
    expect(html).not.toContain("<form");
    expect(html).toContain("Ödeme bağlantısı geçersiz.");
  });
});
