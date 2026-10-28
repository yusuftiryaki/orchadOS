import { demoText, type DemoTourStepId } from "@/lib/i18n/messages/demo";
import type { DemoTour } from "./info";

// The guided tour through the real owner portal (docs/demo-turu.md §11.4).
// Each step names its page and the data-testid targets it points at; `ctx` is
// demo_info().tour. A step whose page cannot be built (no tour data) or whose
// targets are missing is skipped. "son" stays on the current page.

export interface TourStep {
  id: DemoTourStepId;
  // The page of the step, without ?tur; null: any page.
  href: (ctx: DemoTour) => string | null;
  targets: string[];
  title: string;
  body: string;
  anyPage?: boolean;
}

const parcel = (ctx: DemoTour, rest = "") =>
  ctx.parcel_id ? `/portal/parsel/${ctx.parcel_id}${rest}` : null;

const step = (
  id: DemoTourStepId,
  href: TourStep["href"],
  targets: string[],
  extra: Partial<TourStep> = {},
): TourStep => ({ id, href, targets, ...demoText.tour.steps[id], ...extra });

export const TOUR_STEPS: readonly TourStep[] = [
  step("bahceler", () => "/portal", ["parcel-list"]),
  step("gezi", (ctx) => parcel(ctx, "/gezi"), ["tour-viewer", "tour-visit"]),
  step("harita", (ctx) => parcel(ctx, "?katman=isi"), ["parcel-map", "map-controls"]),
  step("karne", (ctx) => parcel(ctx), ["health-score", "dimensions"]),
  step("bulgular", (ctx) => parcel(ctx), ["findings"]),
  step("agac", (ctx) => (ctx.tree_id ? parcel(ctx, `/agac/${ctx.tree_id}`) : null), [
    "tree-card",
    "photo-evidence",
    "hash-check",
  ]),
  step(
    "ziyaret",
    (ctx) =>
      ctx.previous_session_id ? parcel(ctx, `?ziyaret=${ctx.previous_session_id}`) : parcel(ctx),
    ["visit-select", "parcel-map"],
  ),
  step("envanter", (ctx) => parcel(ctx, "/envanter"), ["inventory-report"]),
  step("pdf", (ctx) => parcel(ctx), ["report-pdf"]),
  step("son", () => null, ["demo-banner"], { anyPage: true }),
];

export const TOUR_PARAM = "tur";

export function stepIndex(id: string | null | undefined): number {
  return id ? TOUR_STEPS.findIndex((s) => s.id === id) : -1;
}

// The step's address with ?tur=<id>; for "son" the current address.
export function stepUrl(step: TourStep, ctx: DemoTour, current: string): string | null {
  const base = step.anyPage ? current : step.href(ctx);
  if (base === null) return null;
  const url = new URL(base, "http://x");
  url.searchParams.set(TOUR_PARAM, step.id);
  return `${url.pathname}${url.search}`;
}

// The browser is on the step's page: same path and the same query apart from
// ?tur.
export function onStepPage(
  step: TourStep,
  ctx: DemoTour,
  pathname: string,
  search: URLSearchParams,
): boolean {
  if (step.anyPage) return true;
  const href = step.href(ctx);
  if (href === null) return false;
  const want = new URL(href, "http://x");
  if (want.pathname !== pathname) return false;
  const have = new URLSearchParams(search);
  have.delete(TOUR_PARAM);
  const norm = (p: URLSearchParams) =>
    [...p.entries()]
      .map((e) => e.join("="))
      .sort()
      .join("&");
  return norm(want.searchParams) === norm(have);
}
