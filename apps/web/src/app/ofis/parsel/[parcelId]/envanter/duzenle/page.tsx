import { notFound } from "next/navigation";
import { InventoryWorkspaceView } from "@/components/office/inventory-workspace";
import styles from "@/components/office/inventory.module.css";
import staff from "@/components/staff-page.module.css";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import {
  loadInventoryWorkspace,
  WORKSPACE_TABS,
  type WorkspaceTab,
} from "@/lib/office/inventory-workspace";
import type { LatLon } from "@/lib/office/local-frame";
import { officePanoramaSources } from "@/lib/office/panorama-source";
import { sourceOfSet, type PanoramaSetInfo, type PanoramaSource } from "@/lib/office/panoramas";
import { UUID_RE } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";
import { SpeciesNotice } from "@/components/species-notice";
import { StaffWorldButton } from "@/components/staff/staff-world";
import { loadSizeSuggestions, loadStaffWorld } from "@/lib/lidar/staff";
import { acceptSizeClassAction, signOfficeWorldAction } from "./actions";

// Inventory workspace of one parcel (after the triangulation tool saved the
// slots): tree attributes, infrastructure, boundary, verification tour.
// ?sekme=attributes|infrastructure|boundary|verification opens a tab.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ parcelId: string }>;
  searchParams: Promise<{ sekme?: string | string[] }>;
}) {
  const user = await requireSection("ofis");
  const [{ parcelId }, query] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(parcelId)) notFound();
  const supabase = await createClient();
  const sources = officePanoramaSources(supabase, user.id);
  // The panorama sets (for the scan track) are listed while the workspace
  // loads; they are only used when the parcel exists.
  const [ws, setLists, suggestions, world] = await Promise.all([
    loadInventoryWorkspace(supabase, parcelId),
    Promise.all(sources.map((s) => s.listSets(parcelId))),
    loadSizeSuggestions(supabase, parcelId),
    loadStaffWorld(supabase, parcelId),
  ]);
  if (!ws) notFound();

  const back = { href: `/ofis/parsel/${parcelId}`, label: ws.parcel.name };
  const o = t.inventory.office;

  if (ws.slots.length === 0) {
    return (
      <main className={`${staff.wide} ${styles.page}`}>
        <PageHeader back={back} title={o.title} />
        <EmptyState
          title={o.noInventoryTitle}
          action={<ButtonLink href={`/ofis/parsel/${parcelId}/envanter`}>{o.openTool}</ButtonLink>}
        >
          <p>{o.noInventory}</p>
        </EmptyState>
      </main>
    );
  }

  const track = await scanTrack(
    sources,
    setLists.flat(),
    parcelId,
    ws.inventorySession?.id ?? null,
  );
  const tab = typeof query.sekme === "string" ? query.sekme : "";
  const approvedAt = ws.approved ? (ws.inventorySession?.publishedAt ?? null) : null;
  return (
    <main className={`${staff.wide} ${styles.page}`}>
      <PageHeader
        back={back}
        title={o.title}
        lead={o.lead}
        actions={
          world && (
            <StaffWorldButton
              world={world}
              sign={signOfficeWorldAction}
              accept={acceptSizeClassAction}
            />
          )
        }
      />
      <SpeciesNotice species={ws.parcel.species} />
      {approvedAt && (
        <Alert tone="success" testId="inventory-approved">
          <p>{o.approved(formatDate(approvedAt))}</p>
        </Alert>
      )}
      <InventoryWorkspaceView
        ws={ws}
        track={track}
        canDeleteZones={user.roles.orgRoles.includes("ops")}
        suggestions={Object.fromEntries(suggestions)}
        initialTab={
          WORKSPACE_TABS.includes(tab as WorkspaceTab) ? (tab as WorkspaceTab) : "attributes"
        }
      />
    </main>
  );
}

// Panorama positions of the inventory session's processed run, in capture
// order: the trajectory the boundary is drawn on. Another set of the parcel
// when the session has none.
async function scanTrack(
  sources: PanoramaSource[],
  sets: PanoramaSetInfo[],
  parcelId: string,
  sessionId: string | null,
): Promise<LatLon[]> {
  const set =
    sets.find((s) => s.sessionId === sessionId) ?? sets.find((s) => s.parcelId === parcelId);
  if (!set) return [];
  const panoramas = (await sourceOfSet(sources, set.id)?.listPanoramas(set.id)) ?? [];
  return panoramas.map((p) => ({ lat: p.lat, lon: p.lon }));
}
