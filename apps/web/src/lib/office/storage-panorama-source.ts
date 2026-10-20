import { createMediaSigner, type MediaSigner } from "@/lib/media/signer";
import { panoramaVariant, poseGpsTimeNs } from "@/lib/media/panorama-variants";
import { fetchAll, isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import {
  panoramasFromAssets,
  type PanoramaImage,
  type PanoramaInfo,
  type PanoramaSetInfo,
  type PanoramaSource,
  type PanoramaVariant,
} from "./panoramas";

// Panoramas uploaded by the pipeline (`orchados-pipeline upload`): asset rows
// with kind = panorama, files in the private media bucket. One set per
// session and pipeline version (reprocessing adds new rows, old ones stay).
// Every query and every signed URL runs as the signed-in user, so row level
// security decides what is listed and served.

// Not in the asset rows yet (docs/arayuzler.md); the pipeline's default.
const DEFAULT_CAMERA_HEIGHT_M = 2.0;

const PANORAMA_COLUMNS = "id, position::json, position_uncertainty_m, pose, quality_score";

interface SetKey {
  sessionId: string;
  pipelineVersion: string;
}

export function encodeStorageSetId(key: SetKey): string {
  const raw = JSON.stringify([key.sessionId, key.pipelineVersion]);
  return `storage-${Buffer.from(raw, "utf8").toString("base64url")}`;
}

export function decodeStorageSetId(id: string): SetKey | null {
  if (!id.startsWith("storage-")) return null;
  try {
    const value = JSON.parse(Buffer.from(id.slice(8), "base64url").toString("utf8"));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      isUuid(value[0]) &&
      typeof value[1] === "string"
    ) {
      return { sessionId: value[0], pipelineVersion: value[1] };
    }
  } catch {
    // Not one of ours.
  }
  return null;
}

export class StoragePanoramaSource implements PanoramaSource {
  readonly kind = "storage" as const;
  private readonly signer: MediaSigner;

  constructor(
    private readonly supabase: Client,
    // Whose permissions signed URLs carry (the user id); see createMediaSigner.
    scope: string,
  ) {
    this.signer = createMediaSigner(supabase, { scope });
  }

  async listSets(parcelId: string): Promise<PanoramaSetInfo[]> {
    if (!isUuid(parcelId)) return [];
    const rows = await fetchAll((from, to) =>
      this.supabase
        .from("asset")
        .select("id, session_id, pipeline_version, params_hash, pose")
        .eq("parcel_id", parcelId)
        .eq("kind", "panorama")
        .order("id")
        .range(from, to),
    );
    const sets = new Map<string, PanoramaSetInfo & { frames: Set<string> }>();
    for (const row of rows) {
      const id = encodeStorageSetId({
        sessionId: row.session_id,
        pipelineVersion: row.pipeline_version,
      });
      const set = sets.get(id) ?? {
        id,
        source: "storage" as const,
        sessionId: row.session_id,
        parcelId,
        label: `v${row.pipeline_version}${row.params_hash ? `_${row.params_hash.slice(0, 8)}` : ""}`,
        pipelineVersion: row.pipeline_version,
        paramsHash: row.params_hash,
        cameraHeightM: DEFAULT_CAMERA_HEIGHT_M,
        count: 0,
        frames: new Set<string>(),
      };
      sets.set(id, set);
      set.frames.add(poseGpsTimeNs(row.pose) ?? row.id);
    }
    return [...sets.values()]
      .map(({ frames, ...set }) => ({ ...set, count: frames.size }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async listPanoramas(setId: string): Promise<PanoramaInfo[] | null> {
    const key = decodeStorageSetId(setId);
    if (!key) return null;
    const rows = await fetchAll((from, to) =>
      this.supabase
        .from("asset")
        .select(PANORAMA_COLUMNS)
        .eq("session_id", key.sessionId)
        .eq("pipeline_version", key.pipelineVersion)
        .eq("kind", "panorama")
        .order("created_at")
        .order("id")
        .range(from, to),
    );
    return rows.length > 0 ? panoramasFromAssets(rows) : null;
  }

  // panoramaId is the frame's main asset (full resolution, else preview); the
  // other variant is the row of the same set with the same gps_time_ns.
  async readImage(
    setId: string,
    panoramaId: string,
    variant: PanoramaVariant,
  ): Promise<PanoramaImage | null> {
    const key = decodeStorageSetId(setId);
    if (!key || !isUuid(panoramaId)) return null;
    const { data: main, error } = await this.supabase
      .from("asset")
      .select("id, uri, pose")
      .eq("id", panoramaId)
      .eq("session_id", key.sessionId)
      .eq("pipeline_version", key.pipelineVersion)
      .eq("kind", "panorama")
      .maybeSingle();
    if (error) throw error;
    if (!main) return null;

    const wanted = variant === "4k" ? "full" : "preview";
    let uri: string | null = panoramaVariant(main.pose) === wanted ? main.uri : null;
    const time = poseGpsTimeNs(main.pose);
    if (!uri && time !== null) {
      const { data: siblings, error: siblingError } = await this.supabase
        .from("asset")
        .select("id, uri, pose")
        .eq("session_id", key.sessionId)
        .eq("pipeline_version", key.pipelineVersion)
        .eq("kind", "panorama")
        .eq("pose->>gps_time_ns", time)
        .order("created_at")
        .order("id");
      if (siblingError) throw siblingError;
      uri = siblings.find((s) => panoramaVariant(s.pose) === wanted)?.uri ?? null;
    }
    const url = await this.signer.signUrl(uri);
    return url ? { kind: "redirect", url } : null;
  }
}
