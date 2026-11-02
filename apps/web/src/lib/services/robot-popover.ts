// The robot badge's card (components/services/robot-badge.tsx): when it is
// open. Pure; unit tested.
//
// A mouse hovering the badge, or keyboard focus reaching its button, opens
// the card; leaving with the mouse closes it again,
// unless the card was opened deliberately: a click, a tap, Enter or Space on
// the button "pins" it. A pinned card stays until the button is pressed
// again, Escape, a click or tap outside, or focus leaving the badge. Nothing
// is reachable by hover alone: the button opens the same card.

export interface PopoverState {
  open: boolean;
  pinned: boolean;
}

export type PopoverEvent =
  // A mouse pointer entered or left the badge and its card.
  | "hover-enter"
  | "hover-leave"
  // Keyboard focus reached the button (:focus-visible): opens like a hover.
  | "focus-in"
  // The button was activated (click, tap, Enter, Space).
  | "toggle"
  | "escape"
  // A pointer down outside the badge and its card.
  | "outside"
  // Focus moved to an element outside the badge and its card.
  | "focus-out";

export const POPOVER_CLOSED: PopoverState = { open: false, pinned: false };

export function popoverReducer(state: PopoverState, event: PopoverEvent): PopoverState {
  switch (event) {
    case "hover-enter":
    case "focus-in":
      return state.open ? state : { open: true, pinned: false };
    case "hover-leave":
      return state.pinned ? state : POPOVER_CLOSED;
    case "toggle":
      // Open by hover: the press keeps it open rather than closing what the
      // reader is looking at.
      if (state.open && !state.pinned) return { open: true, pinned: true };
      return state.open ? POPOVER_CLOSED : { open: true, pinned: true };
    case "escape":
    case "outside":
    case "focus-out":
      return state.open ? POPOVER_CLOSED : state;
  }
}
