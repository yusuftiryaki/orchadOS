import type { BadgeTone } from "./badge";

// One tone per state across the whole app (docs/tasarim-sistemi.md §Kullanım
// 5): the same state reads the same in the portal, the back office, the
// office and the expert panel. The text always names the state; the tone only
// supports it.
//
// - success: done, in force, paid
// - warning: waits on the customer (or on money), or is about to end
// - info: in progress, ours to move
// - danger: went wrong or ended badly
// - neutral: not started, or closed without effect
//
// Codes are shared between families where they mean the same thing. The few
// that mean something else in one family are in FAMILY below.
const TONES: Record<string, BadgeTone> = {
  // success
  accepted: "success",
  active: "success",
  succeeded: "success",
  paid: "success",
  completed: "success",
  published: "success",
  done: "success",
  sent: "success",
  answered: "success",
  in_service: "success",
  active_monitoring: "success",
  inventory_done: "success",
  checked: "success",
  // warning
  quoted: "warning",
  issued: "warning",
  awaiting_payment: "warning",
  leaving: "warning",
  open: "warning",
  // info
  submitted: "info",
  pending: "info",
  pending_review: "info",
  in_review: "info",
  requested: "info",
  initiated: "info",
  processing: "info",
  in_progress: "info",
  scheduled: "info",
  planned: "info",
  captured: "info",
  processed: "info",
  upcoming: "info",
  inventory_planned: "info",
  // danger
  failed: "danger",
  expired: "danger",
  rejected: "danger",
  terminated: "danger",
  // neutral
  draft: "neutral",
  registered: "neutral",
  cancelled: "neutral",
  withdrawn: "neutral",
  superseded: "neutral",
  declined: "neutral",
  voided: "neutral",
  passive: "neutral",
  removed: "neutral",
  closed: "neutral",
  none: "neutral",
};

export type StatusKind =
  | "application"
  | "quote"
  | "order"
  | "payment"
  | "refund"
  | "removal"
  | "garden"
  | "visit"
  | "parcel"
  | "kvkk"
  | "viewer"
  | "installment";

// An order or a garden removal that is completed has ended: the service is no
// longer in force. A scheduled removal warns that the garden is leaving.
const FAMILY: Partial<Record<StatusKind, Record<string, BadgeTone>>> = {
  order: { completed: "neutral" },
  removal: { completed: "neutral", scheduled: "warning" },
  // An installment not yet due is not late: the "Sıradaki" badge beside it
  // carries the warning.
  installment: { pending: "neutral" },
  // An open KVKK request waits on us; a shareholder's active access is a fact,
  // not an achievement.
  kvkk: { open: "info" },
  viewer: { active: "neutral" },
};

export function statusTone(status: string, kind?: StatusKind): BadgeTone {
  return (kind && FAMILY[kind]?.[status]) ?? TONES[status] ?? "neutral";
}

// Finding severity (docs/metodoloji.md §8) as a badge tone, the same in the
// expert panel, the portal and on the map rings (components/portal/colors.ts).
const SEVERITY: Record<string, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
  info: "info",
};

export function severityTone(severity: string): BadgeTone {
  return SEVERITY[severity] ?? "neutral";
}
