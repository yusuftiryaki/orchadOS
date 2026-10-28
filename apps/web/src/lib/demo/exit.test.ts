import { describe, expect, it } from "vitest";
import { demoExitTarget } from "./exit";

describe("demoExitTarget", () => {
  it.each(["/", "/kayit", "/giris", "/iletisim", "/paketler"])("keeps %s", (next) => {
    expect(demoExitTarget(next, null)).toBe(next);
  });

  it.each(["/portal", "https://evil.example", "//evil.example", "/kayit/../portal", "", null, 1])(
    "turns %s into /",
    (next) => {
      expect(demoExitTarget(next, null)).toBe("/");
    },
  );

  it("goes to the main site from a demo host", () => {
    expect(demoExitTarget("/kayit", "https://orchados.example")).toBe(
      "https://orchados.example/kayit",
    );
    expect(demoExitTarget("/x", "https://orchados.example")).toBe("https://orchados.example/");
  });
});
