// The visitor asked the system for less motion (WCAG 2.3.3): camera moves on
// the maps and panorama inertia are then instant. False on the server and in
// browsers without matchMedia.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

