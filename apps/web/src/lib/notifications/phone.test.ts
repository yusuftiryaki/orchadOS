import { describe, expect, it } from "vitest";
import { maskPhone } from "./phone";

describe("maskPhone", () => {
  it.each([
    ["+905321234501", "+90 5•• ••• •• 01"],
    ["905321234567", "+90 5•• ••• •• 67"],
    ["+4915112345678", "+49 ••••••••• 78"],
    ["+90312123456", "+90 ••••••• 56"],
    ["123", "••••"],
    [null, ""],
    ["", ""],
  ])("%s -> %s", (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });

  it("keeps only the last two digits of the subscriber number", () => {
    expect(maskPhone("+905321234501").replace(/[^0-9]/g, "")).toBe("90501");
  });
});
