import { notFound } from "next/navigation";
import type { MapLayer } from "@/components/portal/health-map";
import { ParcelReportView } from "@/components/portal/parcel-report";
import { ServiceCard, type ServiceCardData } from "@/components/portal/service-card";
import { requireSection } from "@/lib/auth/session";
import { MARKER_ORDER, type MarkerState } from "@/lib/map/tree-style";
import { DEMO_PDF_LIMIT } from "@/lib/pdf/serve";
import { loadBoundaryCard } from "@/lib/portal/boundary";
import { getParcelReport } from "@/lib/portal/data";
import { listThreads } from "@/lib/portal/questions";
import { loadParcelViewers } from "@/lib/portal/viewers";
import {
  getParcelServiceStatus,
  getServicePeriods,
  latestWithdrawal,
  listMyGardens,
  pendingOrderOfParcel,
  previewGardenRemoval,
  type RemovalTiming,
} from "@/lib/portal-billing/data";
import { istanbulToday, openRemoval, removable } from "@/lib/portal-billing/gardens";
import type { Client } from "@/lib/supabase/types";
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
    bilgi?: string | string[];
  }>;
}) {
  const user = await requireSection("portal");
  const [{ parcelId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  // IP14: a demo visitor has no service status and no customer reads.
  const customer = user.roles.customer && !user.demo;
  const [report, boundaryCard, threads, viewers, status, service] = await Promise.all([
    getParcelReport(supabase, parcelId),
    loadBoundaryCard(supabase, parcelId, user.id),
    listThreads(supabase, user.id, { parcelId }),
    loadParcelViewers(supabase, parcelId, user.id),
    user.demo ? null : getParcelServiceStatus(supabase, parcelId),
    customer ? loadServiceCard(supabase, user.id, parcelId) : null,
  ]);
  // Not visible under RLS looks the same as not existing.
  if (!report) notFound();
  // A removed garden is read-only for everyone with access while its reports
  // stay open (docs/bahce-yonetimi.md §5.4).
  const removedUntil = status?.status === "removed" ? (status.access_until ?? null) : null;
  const readOnly = status?.status === "removed";

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
        readOnly,
      }}
      viewers={{ data: viewers, outcome: first(query.hissedar), readOnly }}
      removedUntil={removedUntil}
      serviceCard={
        service ? (
          <ServiceCard
            data={service}
            params={{ bilgi: first(query.bilgi), hata: first(query.hata) }}
          />
        ) : null
      }
      demo={user.demo}
      pdfLimit={user.demo && first(query.hata) === DEMO_PDF_LIMIT}
    />
  );
}

// The paying owner's service card: their my_gardens row of the parcel and,
// while it may be removed, one preview per timing (§5.1). Null for a
// co-owner or a parcel without an order line (pilot). Withdrawal (T03, H10):
// offered inside the withdrawal period also while garden changes are off
// (then alone) and over an open removal of another kind (it supersedes it);
// a recorded withdrawal is confirmed on the card.
async function loadServiceCard(
  supabase: Client,
  userId: string,
  parcelId: string,
): Promise<ServiceCardData | null> {
  const [gardens, { periods }] = await Promise.all([
    listMyGardens(supabase),
    getServicePeriods(supabase),
  ]);
  const garden = gardens.find((g) => g.parcel_id === parcelId);
  if (!garden) return null;
  const today = istanbulToday();
  const changesEnabled = periods.some((p) => p.garden_changes_enabled);
  const withdrawalOpen = !!garden.withdrawal_until && garden.withdrawal_until >= today;
  const withdrawal = await latestWithdrawal(supabase, userId, parcelId);
  const data: ServiceCardData = {
    garden,
    changesEnabled,
    options: [],
    previewError: null,
    pendingOrderId: null,
    today,
    withdrawal,
  };
  const open = openRemoval(garden);
  const openWithdrawal = open && withdrawal?.number === garden.removal_number;
  let timings: RemovalTiming[];
  if (removable(garden) && changesEnabled) {
    timings = withdrawalOpen ? ["notice", "period_end", "withdrawal"] : ["notice", "period_end"];
  } else if (
    withdrawalOpen &&
    !openWithdrawal &&
    (removable(garden) || (open && garden.state !== "removed"))
  ) {
    timings = ["withdrawal"];
  } else {
    return data;
  }
  const preview = await previewGardenRemoval(supabase, parcelId, timings);
  if (preview.ok) {
    data.options = preview.options;
  } else {
    data.previewError = preview.error;
    if (preview.error === "parcel_order_pending") {
      data.pendingOrderId = await pendingOrderOfParcel(supabase, userId, parcelId);
    }
  }
  return data;
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
