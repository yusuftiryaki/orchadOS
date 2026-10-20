import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  parsePanoramaSidecar,
  parsePanoramasJson,
  type PanoramaImage,
  type PanoramaInfo,
  type PanoramaSetInfo,
  type PanoramaSource,
  type PanoramaVariant,
} from "./panoramas";

// Reads processed pipeline runs from a folder on disk: every directory below
// the root (up to MAX_DEPTH levels) that holds a panoramas.json is one set.
// Development only (see officePanoramaSources()); production reads from storage.

const MAX_DEPTH = 4;

function encodeId(relPath: string): string {
  return `local-${Buffer.from(relPath, "utf8").toString("base64url")}`;
}

interface RunDir {
  id: string;
  dir: string;
}

export class LocalPanoramaSource implements PanoramaSource {
  readonly kind = "local" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private async findRuns(): Promise<RunDir[]> {
    const runs: RunDir[] = [];
    const walk = async (dir: string, depth: number) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      if (entries.some((e) => e.isFile() && e.name === "panoramas.json")) {
        runs.push({ id: encodeId(relative(this.root, dir) || "."), dir });
        return;
      }
      if (depth >= MAX_DEPTH) return;
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.isDirectory() && !e.name.startsWith(".")) await walk(join(dir, e.name), depth + 1);
      }
    };
    await walk(this.root, 0);
    return runs;
  }

  // Ids are matched against discovered folders only, never turned into paths.
  private async findRun(setId: string): Promise<RunDir | null> {
    return (await this.findRuns()).find((r) => r.id === setId) ?? null;
  }

  private async readRun(run: RunDir) {
    const raw = parsePanoramasJson(await readFile(join(run.dir, "panoramas.json"), "utf8"));
    let manifest: Record<string, unknown> = {};
    try {
      manifest = JSON.parse(await readFile(join(run.dir, "manifest.json"), "utf8"));
    } catch {
      // Optional: the set falls back to the sidecars' session id.
    }
    return { raw, manifest };
  }

  // Every run under the root, whatever its parcel (development data).
  async listSets(): Promise<PanoramaSetInfo[]> {
    const sets: PanoramaSetInfo[] = [];
    for (const run of await this.findRuns()) {
      try {
        const { raw, manifest } = await this.readRun(run);
        const session = (manifest.session ?? {}) as Record<string, unknown>;
        const first = (raw[0] ?? {}) as Record<string, unknown>;
        const producer = (first.producer ?? {}) as Record<string, unknown>;
        const sessionId =
          typeof session.session_id === "string"
            ? session.session_id
            : typeof first.session_id === "string"
              ? first.session_id
              : "";
        sets.push({
          id: run.id,
          source: "local",
          sessionId,
          parcelId: typeof session.parcel_id === "string" ? session.parcel_id : null,
          label: run.dir.split(sep).slice(-2).join("/"),
          pipelineVersion: typeof producer.version === "string" ? producer.version : null,
          paramsHash: typeof producer.params_hash === "string" ? producer.params_hash : null,
          cameraHeightM:
            typeof session.camera_height_m === "number" ? session.camera_height_m : 2.0,
          count: raw.filter((p) => parsePanoramaSidecar(p)).length,
        });
      } catch {
        // A half-written run is skipped, not fatal.
      }
    }
    return sets;
  }

  async listPanoramas(setId: string): Promise<PanoramaInfo[] | null> {
    const run = await this.findRun(setId);
    if (!run) return null;
    const { raw } = await this.readRun(run);
    return raw.map(parsePanoramaSidecar).filter((p): p is PanoramaInfo => p !== null);
  }

  async readImage(
    setId: string,
    panoramaId: string,
    variant: PanoramaVariant,
  ): Promise<PanoramaImage | null> {
    const run = await this.findRun(setId);
    if (!run) return null;
    const { raw } = await this.readRun(run);
    const entry = raw.find(
      (p) => (p as Record<string, unknown> | null)?.panorama_id === panoramaId,
    ) as Record<string, unknown> | undefined;
    const file = (variant === "4k" ? entry?.image : entry?.preview) as
      Record<string, unknown> | undefined;
    if (!file || typeof file.path !== "string") return null;
    const path = resolve(run.dir, file.path);
    const rel = relative(run.dir, path);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    try {
      if (!(await stat(path)).isFile()) return null;
      return {
        kind: "data",
        data: new Uint8Array(await readFile(path)),
        mediaType: typeof file.media_type === "string" ? file.media_type : "image/webp",
        sha256: typeof file.sha256 === "string" ? file.sha256 : null,
      };
    } catch {
      return null;
    }
  }
}
