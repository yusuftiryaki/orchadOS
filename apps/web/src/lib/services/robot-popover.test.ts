import { describe, expect, it } from "vitest";
import { POPOVER_CLOSED, popoverReducer, type PopoverEvent } from "./robot-popover";

const run = (...events: PopoverEvent[]) => events.reduce(popoverReducer, POPOVER_CLOSED);

describe("robot badge card", () => {
  it("the button (click, tap, Enter, Space) opens and closes it", () => {
    expect(run("toggle")).toEqual({ open: true, pinned: true });
    expect(run("toggle", "toggle")).toEqual(POPOVER_CLOSED);
  });

  it("Escape, a click outside and focus leaving close it", () => {
    for (const event of ["escape", "outside", "focus-out"] as const) {
      expect(run("toggle", event)).toEqual(POPOVER_CLOSED);
      expect(run("hover-enter", event)).toEqual(POPOVER_CLOSED);
      expect(run(event)).toEqual(POPOVER_CLOSED);
    }
  });

  it("a mouse hover opens it and leaving closes it again", () => {
    expect(run("hover-enter")).toEqual({ open: true, pinned: false });
    expect(run("hover-enter", "hover-leave")).toEqual(POPOVER_CLOSED);
  });

  it("keyboard focus on the button opens it like a hover; Enter then keeps it open", () => {
    expect(run("focus-in")).toEqual({ open: true, pinned: false });
    expect(run("focus-in", "toggle")).toEqual({ open: true, pinned: true });
    expect(run("focus-in", "focus-out")).toEqual(POPOVER_CLOSED);
    expect(run("focus-in", "escape")).toEqual(POPOVER_CLOSED);
  });

  it("a press on a hover-opened card keeps it open; leaving then does not close it", () => {
    expect(run("hover-enter", "toggle")).toEqual({ open: true, pinned: true });
    expect(run("hover-enter", "toggle", "hover-leave")).toEqual({ open: true, pinned: true });
    expect(run("toggle", "hover-enter", "hover-leave")).toEqual({ open: true, pinned: true });
    expect(run("hover-enter", "toggle", "toggle")).toEqual(POPOVER_CLOSED);
  });
});
