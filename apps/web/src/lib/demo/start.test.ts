import { describe, expect, it } from "vitest";
import { demoStartErrorOf } from "./start";

describe("demoStartErrorOf", () => {
  it.each([
    [400, { error: "captcha_failed" }, "captcha_failed"],
    [429, { error: "rate_limited" }, "rate_limited"],
    [503, { error: "demo_closed" }, "demo_closed"],
    [503, { error: "demo_capacity" }, "demo_capacity"],
    [500, { error: "failed" }, "failed"],
    [404, null, "unavailable"],
    [502, "bad gateway", "unavailable"],
    [401, { error: "unauthorized" }, "failed"],
  ] as const)("%s %j → %s", (status, body, code) => {
    expect(demoStartErrorOf(status, body)).toBe(code);
  });
});
