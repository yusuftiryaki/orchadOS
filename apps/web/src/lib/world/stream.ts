import {
  arrayRange,
  assembleCloud,
  assembleSkeleton,
  headerBytes,
  parseHeader,
  parseWorldCloud,
  skeletonRange,
  WorldCloudError,
  type WorldCloud,
  type WorldCloudHeader,
} from "./format";

// Progressive download of a world cloud (docs/3d-dunya.md §4, §7): its points
// are stored in a shuffled order, so the first points of each array are an
// even sample of the whole parcel. With HTTP ranges the header comes first,
// then the first `share` of the points (shown at once), then the rest; a
// server that ignores ranges answers the first request with the whole file.

// Enough for the header of a parcel with a few hundred trees.
export const HEADER_PROBE_BYTES = 64 * 1024;
export const COARSE_SHARE = 0.25;
// Below this many points the coarse step is not worth a request.
export const MIN_COARSE_POINTS = 20_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface LoadOptions {
  signal?: AbortSignal;
  share?: number;
  // The coarse cloud, before the rest arrives (not called when the first
  // answer is already the whole file or the cloud is small).
  onCoarse?: (cloud: WorldCloud) => void;
  fetch?: Fetch;
}

type Parts = { position: ArrayBuffer; color: ArrayBuffer; tree: ArrayBuffer };
const NAMES = ["position", "color", "tree"] as const;

export async function loadWorldCloud(url: string, options: LoadOptions = {}): Promise<WorldCloud> {
  const f: Fetch = options.fetch ?? ((u, init) => fetch(u, init));
  const get = async (start: number, end: number) => {
    const res = await f(url, {
      signal: options.signal,
      headers: { Range: `bytes=${start}-${end - 1}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ranged: res.status === 206, buffer: await res.arrayBuffer() };
  };

  const first = await get(0, HEADER_PROBE_BYTES);
  if (!first.ranged) return parseWorldCloud(first.buffer);
  let prefix = first.buffer;
  const need = headerBytes(prefix);
  if (need > prefix.byteLength) {
    const again = await get(0, need);
    if (!again.ranged) return parseWorldCloud(again.buffer);
    prefix = again.buffer;
  }
  const header = parseHeader(prefix);
  const n = header.point_count;

  const part = async (from: number, to: number): Promise<Parts> => {
    const buffers = await Promise.all(
      NAMES.map(async (name) => {
        const r = await get(...arrayRange(header, name, from, to));
        if (!r.ranged) throw new WorldCloudError("the server stopped answering ranges");
        return r.buffer;
      }),
    );
    return { position: buffers[0], color: buffers[1], tree: buffers[2] };
  };

  // A winter scan's skeleton and cuts close the file: one range after the points.
  const withSkeleton = async (cloud: WorldCloud) => {
    const range = skeletonRange(header);
    if (!range) {
      cloud.skeleton = null;
      return cloud;
    }
    const r = await get(...range);
    if (!r.ranged) throw new WorldCloudError("the server stopped answering ranges");
    cloud.skeleton = assembleSkeleton(header, r.buffer, range[0]);
    return cloud;
  };

  const share = options.share ?? COARSE_SHARE;
  const k = n <= MIN_COARSE_POINTS ? n : Math.min(n, Math.ceil(n * share));
  const head = await part(0, k);
  if (k === n) return withSkeleton(assembleCloud(header, n, head));
  options.onCoarse?.(assembleCloud(header, k, head));
  const rest = await part(k, n);
  return withSkeleton(
    assembleCloud(header, n, {
      position: concat(head.position, rest.position),
      color: concat(head.color, rest.color),
      tree: concat(head.tree, rest.tree),
    }),
  );
}

function concat(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(new Uint8Array(a), 0);
  out.set(new Uint8Array(b), a.byteLength);
  return out.buffer;
}

export type { WorldCloudHeader };
