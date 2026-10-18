import { describe, expect, it } from "vitest";
import { LOGIN_METHODS, safeNextPath } from "./login-methods";

describe("login", () => {
  it("only offers password sign-in for now", () => {
    expect(LOGIN_METHODS.filter((m) => m.enabled).map((m) => m.id)).toEqual(["password"]);
  });

  it.each([
    ["/portal/parsel/x", "/portal/parsel/x"],
    ["/", "/"],
    [undefined, "/"],
    [["/a"], "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
  ])("next=%j -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
