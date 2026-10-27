import { describe, expect, it } from "vitest";
import { isAllowedReturnOrigin } from "../../../../../supabase/functions/_shared/payments/origins.ts";

const LIST =
  "https://orchados.vercel.app, http://localhost:3000 http://127.0.0.1:3000,https://orchados-*-orchad-os.vercel.app";

describe("isAllowedReturnOrigin", () => {
  it("accepts listed origins exactly", () => {
    expect(isAllowedReturnOrigin("https://orchados.vercel.app", LIST, false)).toBe(true);
    expect(isAllowedReturnOrigin("http://localhost:3000", LIST, false)).toBe(true);
    expect(isAllowedReturnOrigin("http://127.0.0.1:3000", LIST, false)).toBe(true);
    expect(
      isAllowedReturnOrigin("https://orchados.vercel.app", ["https://orchados.vercel.app"], false),
    ).toBe(true);
  });

  it.each([
    "https://evil.com#.vercel.app",
    "https://orchados.vercel.app/",
    "https://orchados.vercel.app/portal",
    "https://orchados.vercel.app?x=1",
    "https://user@orchados.vercel.app",
    "https://ORCHADOS.vercel.app",
    "https://orchados.vercel.app.evil.com",
    "https://orchados.vercel.app:8443",
    "",
    "not a url",
  ])("rejects %j", (origin) => {
    expect(isAllowedReturnOrigin(origin, LIST, true)).toBe(false);
  });

  it("rejects http:// outside localhost, even when listed", () => {
    expect(
      isAllowedReturnOrigin("http://orchados.vercel.app", "http://orchados.vercel.app", true),
    ).toBe(false);
    expect(isAllowedReturnOrigin("http://localhost:3000", "http://localhost:3000", false)).toBe(
      true,
    );
  });

  it("uses a glob only with the preview flag", () => {
    const preview = "https://orchados-git-feature-1-orchad-os.vercel.app";
    expect(isAllowedReturnOrigin(preview, LIST, false)).toBe(false);
    expect(isAllowedReturnOrigin(preview, LIST, true)).toBe(true);
  });

  it("a glob never matches a dot", () => {
    expect(isAllowedReturnOrigin("https://orchados-a.b-orchad-os.vercel.app", LIST, true)).toBe(
      false,
    );
    expect(isAllowedReturnOrigin("https://orchados-A-orchad-os.vercel.app", LIST, true)).toBe(
      false,
    );
  });

  it("rejects everything with an empty list", () => {
    expect(isAllowedReturnOrigin("https://orchados.vercel.app", undefined, true)).toBe(false);
    expect(isAllowedReturnOrigin("https://orchados.vercel.app", "", true)).toBe(false);
  });
});
