import { severityTone } from "@/components/ui/status";
import type { Severity } from "@/lib/portal/findings";
import { MAP_COLORS } from "@/lib/map/tree-style";

// Finding colours by severity on the map (rings drawn by portal-map.tsx): the
// text colour of the severity's badge tone (components/ui/status.ts), so a
// ring and the badge next to it agree. Kept out of the client components so
// server components can import them.
export const SEVERITY_COLORS: Record<Severity, string> = {
  high: MAP_COLORS.danger,
  medium: MAP_COLORS.warning,
  low: MAP_COLORS.muted,
  info: MAP_COLORS.info,
};

// The same severities in lists and panels: a badge tone, always with the
// severity's name ("Acil", "Önemli").
export const SEVERITY_TONES = {
  high: severityTone("high"),
  medium: severityTone("medium"),
  low: severityTone("low"),
  info: severityTone("info"),
} as const satisfies Record<Severity, ReturnType<typeof severityTone>>;
