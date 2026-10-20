import { notFound } from "next/navigation";
import { ParcelReportView } from "@/components/portal/parcel-report";
import { requireSection } from "@/lib/auth/session";
import { MARKER_ORDER, type MarkerState } from "@/lib/map/tree-style";
import { getParcelReport } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

// ?sinif=problem,dead opens the map filtered to those classes;
// ?bulgu=<id> selects a finding on the map.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ parcelId: string }>;
  searchParams: Promise<{ sinif?: string | string[]; bulgu?: string | string[] }>;
}) {
  await requireSection("portal");
  const [{ parcelId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const report = await getParcelReport(supabase, parcelId);
  // Not visible under RLS looks the same as not existing.
  if (!report) notFound();

  return (
    <ParcelReportView
      report={report}
      classFilter={parseClassFilter(first(query.sinif))}
      findingId={first(query.bulgu)}
    />
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseClassFilter(value: string | undefined): MarkerState[] | undefined {
  if (!value) return undefined;
  const states = value
    .split(",")
    .filter((s): s is MarkerState => MARKER_ORDER.includes(s as MarkerState));
  return states.length > 0 ? states : undefined;
}
