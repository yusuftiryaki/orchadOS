import { notFound } from "next/navigation";
import type { MapLayer } from "@/components/portal/health-map";
import { ParcelReportView } from "@/components/portal/parcel-report";
import { requireSection } from "@/lib/auth/session";
import { MARKER_ORDER, type MarkerState } from "@/lib/map/tree-style";
import { DEMO_PDF_LIMIT } from "@/lib/pdf/serve";
import { loadBoundaryCard } from "@/lib/portal/boundary";
import { getParcelReport } from "@/lib/portal/data";
import { listThreads } from "@/lib/portal/questions";
import { loadParcelViewers } from "@/lib/portal/viewers";
import { createClient } from "@/lib/supabase/server";

// ?sinif=problem,dead opens the map filtered to those classes;
// ?bulgu=<id> selects a finding on the map; ?ziyaret=<visit> shows one visit,
// ?degisen=1 only the trees that changed, ?katman=isi,kapsama the layers;
// ?hata=demo_pdf_limit after a demo session's PDF cap (servePdf).
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ parcelId: string }>;
  searchParams: Promise<{
    sinif?: string | string[];
    bulgu?: string | string[];
    soru?: string | string[];
    soru_hata?: string | string[];
    hissedar?: string | string[];
    ziyaret?: string | string[];
    degisen?: string | string[];
    katman?: string | string[];
    hata?: string | string[];
  }>;
}) {
  const user = await requireSection("portal");
  const [{ parcelId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [report, boundaryCard, threads, viewers] = await Promise.all([
    getParcelReport(supabase, parcelId),
    loadBoundaryCard(supabase, parcelId, user.id),
    listThreads(supabase, user.id, { parcelId }),
    loadParcelViewers(supabase, parcelId, user.id),
  ]);
  // Not visible under RLS looks the same as not existing.
  if (!report) notFound();

  return (
    <ParcelReportView
      report={report}
      classFilter={parseClassFilter(first(query.sinif))}
      findingId={first(query.bulgu)}
      mapOptions={{
        visitId: first(query.ziyaret),
        changed: first(query.degisen) === "1",
        layers: parseLayers(first(query.katman)),
      }}
      boundaryCard={boundaryCard}
      questions={{
        threads,
        sent: first(query.soru) === "1",
        error: first(query.soru_hata) ?? null,
        demo: user.demo,
      }}
      viewers={{ data: viewers, outcome: first(query.hissedar) }}
      demo={user.demo}
      pdfLimit={user.demo && first(query.hata) === DEMO_PDF_LIMIT}
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

function parseLayers(value: string | undefined): MapLayer[] {
  const names: Record<string, MapLayer> = { isi: "heat", kapsama: "coverage" };
  return (value ?? "")
    .split(",")
    .map((v) => names[v])
    .filter((v): v is MapLayer => Boolean(v));
}
