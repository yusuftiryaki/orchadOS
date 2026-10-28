import type { BadgeTone } from "@/components/ui/badge";
import type { Severity } from "@/lib/portal/findings";

// Finding colours by severity on the map (rings drawn by portal-map.tsx).
// Kept out of the client components so server components can import them.
export const SEVERITY_COLORS: Record<Severity, string> = {
  high: "#c92a2a",
  medium: "#e8590c",
  low: "#f59f00",
  info: "#1c7ed6",
};

// The same severities in lists and panels: a badge tone, always with the
// severity's name ("Acil", "Önemli").
export const SEVERITY_TONES: Record<Severity, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
  info: "info",
};
