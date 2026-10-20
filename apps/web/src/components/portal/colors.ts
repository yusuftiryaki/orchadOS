import type { Severity } from "@/lib/portal/findings";

// Finding colours by severity (map rings, list accents). Kept out of the
// client components so server components can import the values.
export const SEVERITY_COLORS: Record<Severity, string> = {
  high: "#c92a2a",
  medium: "#e8590c",
  low: "#f59f00",
  info: "#1c7ed6",
};
