import type { Position } from "@/lib/map/geo";
import { fetchAll } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import { normalize360, type TourPanorama } from "./tour";

// Panorama viewpoints of published visits for portal readers (T23, H05:
// "Sahiplere personel izi gösterilmez"). Owners, co-owners, viewers and demo
// visitors cannot read panorama asset rows (their pose carries the capture
// time); portal_panorama_frames returns one row per frame, full and preview
// paired on the server, with position and heading but no time.

export interface PanoramaFrame extends TourPanorama {
  sessionId: string;
  fullUri: string | null;
  previewUri: string | null;
}

function isPosition(v: unknown): v is Position {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

export async function panoramaFrames(
  supabase: Client,
  sessionIds: string[],
): Promise<PanoramaFrame[]> {
  if (sessionIds.length === 0) return [];
  const rows = await fetchAll((from, to) =>
    supabase
      .rpc("portal_panorama_frames", { p_session_ids: sessionIds })
      .order("session_id")
      .order("full_asset_id", { nullsFirst: false })
      .order("preview_asset_id", { nullsFirst: false })
      .range(from, to),
  );
  return rows.flatMap((r) => {
    // Nullable in practice: a frame may lack either variant.
    const full = (r.full_asset_id as string | null) ?? null;
    const preview = (r.preview_asset_id as string | null) ?? null;
    const id = full ?? preview;
    const coords = (r.viewpoint as { coordinates?: unknown } | null)?.coordinates;
    if (!id || !isPosition(coords)) return [];
    const heading = Number(r.heading_deg);
    return [
      {
        id,
        sessionId: r.session_id,
        position: [coords[0], coords[1]] as Position,
        headingDeg: r.heading_deg !== null && Number.isFinite(heading) ? normalize360(heading) : 0,
        fullAssetId: full,
        previewAssetId: preview,
        fullUri: (r.full_uri as string | null) ?? null,
        previewUri: (r.preview_uri as string | null) ?? null,
      },
    ];
  });
}
