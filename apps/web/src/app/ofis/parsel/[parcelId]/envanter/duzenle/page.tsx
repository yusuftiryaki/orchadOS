import Link from "next/link";
import { notFound } from "next/navigation";
import { InventoryWorkspaceView } from "@/components/office/inventory-workspace";
import styles from "@/components/office/inventory.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import {
  loadInventoryWorkspace,
  WORKSPACE_TABS,
  type WorkspaceTab,
} from "@/lib/office/inventory-workspace";
import type { LatLon } from "@/lib/office/local-frame";
import { officePanoramaSources } from "@/lib/office/panorama-source";
import { sourceOfSet } from "@/lib/office/panoramas";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const ws = await loadInventoryWorkspace(supabase, parcelId);
  if (!ws) notFound();

  const header = (
    <>
      <p>
        <Link href={`/ofis/parsel/${parcelId}`}>← {t.inventory.office.back}</Link>
      </p>
      <h1>
        {t.inventory.office.title} · {ws.parcel.name}
      </h1>
    </>
  );

  if (ws.slots.length === 0) {
    return (
      <main className={styles.page}>
        {header}
        <p className={styles.notice} role="alert">
          {t.inventory.office.noInventory}{" "}
          <Link href={`/ofis/parsel/${parcelId}/envanter`}>{t.office.openTool}</Link>
        </p>
      </main>
    );
  }

  const track = await scanTrack(supabase, user.id, parcelId, ws.inventorySession?.id ?? null);
  const tab = typeof query.sekme === "string" ? query.sekme : "";
  return (
    <main className={styles.page}>
      {header}
      {ws.approved && ws.inventorySession?.publishedAt && (
        <p className={styles.approved} data-testid="inventory-approved">
          {t.inventory.office.approved(formatDate(ws.inventorySession.publishedAt))}
        </p>
      )}
      <InventoryWorkspaceView
        ws={ws}
        track={track}
        canDeleteZones={user.roles.orgRoles.includes("ops")}
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
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  parcelId: string,
  sessionId: string | null,
): Promise<LatLon[]> {
  const sources = officePanoramaSources(supabase, userId);
  const sets = (await Promise.all(sources.map((s) => s.listSets(parcelId)))).flat();
  const set =
    sets.find((s) => s.sessionId === sessionId) ?? sets.find((s) => s.parcelId === parcelId);
  if (!set) return [];
  const panoramas = (await sourceOfSet(sources, set.id)?.listPanoramas(set.id)) ?? [];
  return panoramas.map((p) => ({ lat: p.lat, lon: p.lon }));
}
