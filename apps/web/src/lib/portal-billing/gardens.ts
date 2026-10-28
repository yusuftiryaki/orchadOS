import type { CustomerGarden, Quote } from "@/lib/billing/types";
import type { RemovalTimingChoice as RemovalTiming } from "@/lib/portal-billing/validation";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";

// Pure helpers of the portal's membership and garden screens (IP14,
// docs/bahce-yonetimi.md §11): the badge of a garden, the end of a quote's
// service, the add-on inputs of a quote. Unit tested.

// "Today" of the database functions (Istanbul), YYYY-MM-DD.
export const istanbulToday = (now: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);

// A day `days` after `day` (YYYY-MM-DD).
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The last day of a one-year service from `start`: start + 1 year − 1 day.
export function oneYearEnd(start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Whole days from `from` to `to` (YYYY-MM-DD).
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const G = P.gardens;
const R = P.removal;

// The state line of a garden (my_gardens.state); the date always after a
// colon, never with a case suffix (§11).
export function gardenBadge(
  garden: Pick<
    CustomerGarden,
    "state" | "service_start" | "service_end" | "removal_effective_on" | "access_until"
  >,
): string {
  switch (garden.state) {
    case "leaving":
      return garden.removal_effective_on
        ? G.leaving(formatDate(garden.removal_effective_on))
        : G.inService;
    case "removed":
      return garden.access_until ? G.removed(formatDate(garden.access_until)) : G.inService;
    case "upcoming":
      return G.upcoming(formatDate(garden.service_start));
    default:
      return G.inService;
  }
}

// The open removal of a garden row, if any.
export const openRemoval = (
  garden: Pick<CustomerGarden, "removal_id" | "removal_status">,
): boolean =>
  !!garden.removal_id &&
  (garden.removal_status === "requested" || garden.removal_status === "scheduled");

// The garden may still be removed by the customer: in service or starting
// next period, and no removal open.
export const removable = (
  garden: Pick<CustomerGarden, "state" | "removal_id" | "removal_status">,
) => (garden.state === "in_service" || garden.state === "upcoming") && !openRemoval(garden);

export interface AddonInputs {
  baseOrderNumber: string | null;
  periodStart: string;
  periodEnd: string;
  serviceStart: string;
  visitsPerYear: number;
  visits: number;
  addonLastDay: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// quote.inputs.addon of a pricing-v2 add-on quote (§9.3); null for any other
// quote or a malformed value.
export function addonInputsOf(inputs: Quote["inputs"]): AddonInputs | null {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) return null;
  const addon = (inputs as Record<string, unknown>).addon;
  if (!addon || typeof addon !== "object" || Array.isArray(addon)) return null;
  const a = addon as Record<string, unknown>;
  const day = (v: unknown) => (typeof v === "string" && DAY.test(v) ? v : null);
  const periodStart = day(a.period_start);
  const periodEnd = day(a.period_end);
  const serviceStart = day(a.service_start);
  const visitsPerYear = typeof a.visits_per_year === "number" ? a.visits_per_year : null;
  const visits = typeof a.visits === "number" ? a.visits : null;
  if (!periodStart || !periodEnd || !serviceStart || visitsPerYear == null || visits == null) {
    return null;
  }
  return {
    baseOrderNumber: typeof a.base_order_number === "string" ? a.base_order_number : null,
    periodStart,
    periodEnd,
    serviceStart,
    visitsPerYear,
    visits,
    addonLastDay: day(a.addon_last_day),
  };
}

// The last day of the service a quote offers: an add-on ends with the
// membership; any other quote serves one year from its proposed start. Without
// a proposed start the service starts on the day of payment (activate_order),
// so there is no fixed day to show yet: null.
export function quoteServiceEnd(
  quote: Pick<Quote, "inputs" | "proposed_service_start">,
): string | null {
  const addon = addonInputsOf(quote.inputs);
  if (addon) return addon.periodEnd;
  return quote.proposed_service_start ? oneYearEnd(quote.proposed_service_start) : null;
}

// The removal timings offered on the service card (§5.1), each with its label.
// customer_removal_plan gives "notice" and "period_end" the same day for a
// garden that starts next period (its start) and for one within the notice
// period of its end (the day after the end): only one of them is offered.
// The notice label counts the days to its effective day, so it follows
// removal_notice_days (customers cannot read the setting).
export function removalChoices<T extends { timing: RemovalTiming; effectiveOn: string }>(
  options: T[],
  state: CustomerGarden["state"],
  today: string,
): { option: T; label: string }[] {
  const notice = options.find((o) => o.timing === "notice");
  const end = options.find((o) => o.timing === "period_end");
  const same = !!notice && !!end && notice.effectiveOn === end.effectiveOn;
  const upcoming = state === "upcoming";
  return options
    .filter((o) => !same || o.timing !== (upcoming ? "period_end" : "notice"))
    .map((option) => ({
      option,
      label:
        option.timing === "notice"
          ? upcoming
            ? R.timings.beforeStart
            : R.timings.notice(daysBetween(today, option.effectiveOn))
          : R.timings[option.timing],
    }));
}
