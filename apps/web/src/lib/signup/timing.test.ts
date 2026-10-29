import { afterEach, describe, expect, it, vi } from "vitest";
import { CODE_STEP_MIN_MS, waitAtLeast } from "./timing";

afterEach(() => {
  vi.useRealTimers();
});

describe("waitAtLeast", () => {
  it("waits for the rest of the floor and no longer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    let done = false;
    const waiting = waitAtLeast(10_000 - 500, CODE_STEP_MIN_MS).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(CODE_STEP_MIN_MS - 501);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(done).toBe(true);
  });

  it("returns at once past the floor", async () => {
    const started = Date.now();
    await waitAtLeast(started - CODE_STEP_MIN_MS - 1, CODE_STEP_MIN_MS);
    expect(Date.now() - started).toBeLessThan(50);
  });
});
