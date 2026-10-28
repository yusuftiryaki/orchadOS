import type { BadgeTone } from "@/components/ui/badge";

// One tone per status code across the back office and operations screens
// (docs/tasarim-sistemi.md §Kullanım 5): the same state reads the same
// everywhere. Codes are shared between families only where they mean the
// same thing ("cancelled" is always neutral, "failed" always danger).
const TONES: Record<string, BadgeTone> = {
  // done, in force, paid
  accepted: "success",
  active: "success",
  succeeded: "success",
  completed: "success",
  published: "success",
  done: "success",
  active_monitoring: "success",
  in_service: "success",
  inventory_done: "success",
  answered: "success",
  // waits on someone else or on money
  awaiting_payment: "warning",
  requested: "warning",
  leaving: "warning",
  open: "warning",
  // in progress, ours to move
  submitted: "info",
  pending_review: "info",
  in_review: "info",
  quoted: "info",
  issued: "info",
  scheduled: "info",
  planned: "info",
  processing: "info",
  in_progress: "info",
  initiated: "info",
  upcoming: "info",
  inventory_planned: "info",
  captured: "info",
  processed: "info",
  // went wrong
  failed: "danger",
  expired: "danger",
  rejected: "danger",
  terminated: "danger",
  // closed without effect
  draft: "neutral",
  cancelled: "neutral",
  withdrawn: "neutral",
  superseded: "neutral",
  declined: "neutral",
  voided: "neutral",
  passive: "neutral",
  registered: "neutral",
  removed: "neutral",
};

export function statusTone(value: string): BadgeTone {
  return TONES[value] ?? "neutral";
}
