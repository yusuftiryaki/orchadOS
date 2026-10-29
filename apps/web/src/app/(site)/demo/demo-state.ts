import type { DemoStartError } from "@/lib/i18n/messages/demo";

export type DemoStartState =
  | { status: "idle" }
  | { status: "ready"; tokenHash: string; verificationType: string; next: string }
  | { status: "error"; code: DemoStartError };

export const INITIAL_DEMO_STATE: DemoStartState = { status: "idle" };
