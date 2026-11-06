// Reader of the 3D world cloud (docs/arayuzler.md, "3D dünya bulutu";
// written by `orchados-pipeline lidar world`). One little-endian file:
// "OWC1", a uint32 header length, a UTF-8 JSON header, then arrays at the
// 4-byte aligned offsets the header names.

export const WORLD_CLOUD_SCHEMA = "orchados.world_cloud/1";
export const WORLD_CLOUD_MAGIC = "OWC1";
// Tree index of points that belong to no tree (ground, grass, boundary).
export const NO_TREE = 65535;

interface ArraySpec {
  offset: number;
  type: string;
  components: number;
}

export interface WorldCloudHeader {
  schema: string;
  session_id: string;
  parcel_id: string;
  origin_lat: number;
  origin_lon: number;
  origin_height_m: number;
  point_count: number;
  quantization: { min: [number, number, number]; scale: [number, number, number] };
  voxel_m: number;
  arrays: Record<string, ArraySpec>;
  trees: { index: number; tree_id: string }[];
  colorized: boolean;
  method: string;
  method_version: string;
  // Winter scans (Faz 2b): branch skeleton segments and pruning cuts.
  segment_count?: number;
  cut_count?: number;
  skeleton?: {
    method: string;
    method_version: string;
    pruning: { method: string; method_version: string; before_session_id: string } | null;
  } | null;
}

// The branch skeleton of a winter scan and the wood pruned since the previous
// one (docs/arayuzler.md, "Kış iskeleti ve budama"), in the cloud's frame.
export interface WorldSkeleton {
  segmentCount: number;
  // Segment ends, east/north/up metres (x0 y0 z0 x1 …).
  a: Float32Array;
  b: Float32Array;
  // Metres.
  radius: Float32Array;
  tree: Uint16Array;
  // 0 standing wood, 1 removed since the previous winter scan.
  kind: Uint8Array;
  cutCount: number;
  cutPosition: Float32Array;
  // Metres.
  cutDiameter: Float32Array;
  cutTree: Uint16Array;
}

export const SEGMENT_STANDING = 0;
export const SEGMENT_PRUNED = 1;

export interface WorldCloud {
  header: WorldCloudHeader;
  count: number;
  // Local east, north, up in metres around the header's origin (x0 y0 z0 x1 …).
  enu: Float32Array;
  // sRGB, 3 bytes per point.
  color: Uint8Array;
  // Index into `treeIds`, NO_TREE for none.
  tree: Uint16Array;
  // Tree index -> tree id.
  treeIds: Map<number, string>;
  // Winter scans only; null when the file has none (or it is not loaded yet).
  skeleton?: WorldSkeleton | null;
}

export class WorldCloudError extends Error {}

const BYTES: Record<string, number> = { uint8: 1, uint16: 2 };

// Bytes the header needs: the magic, its length and the JSON (the arrays start
// after it). A file shorter than this is not a world cloud.
export function headerBytes(prefix: ArrayBuffer): number {
  if (prefix.byteLength < 8) throw new WorldCloudError("file too short");
  const magic = String.fromCharCode(...new Uint8Array(prefix, 0, 4));
  if (magic !== WORLD_CLOUD_MAGIC) throw new WorldCloudError(`unknown magic ${magic}`);
  return 8 + new DataView(prefix).getUint32(4, true);
}

// The header from the start of the file (at least headerBytes() long).
export function parseHeader(prefix: ArrayBuffer): WorldCloudHeader {
  const end = headerBytes(prefix);
  if (end > prefix.byteLength) throw new WorldCloudError("header past the end");
  let header: WorldCloudHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(new Uint8Array(prefix, 8, end - 8)));
  } catch {
    throw new WorldCloudError("header is not JSON");
  }
  if (header?.schema !== WORLD_CLOUD_SCHEMA) {
    throw new WorldCloudError(`unknown schema ${String(header?.schema)}`);
  }
  const count = header.point_count;
  if (!Number.isInteger(count) || count < 0) throw new WorldCloudError("bad point_count");
  for (const [name, type, components] of ARRAYS) {
    const spec = header.arrays?.[name];
    if (
      !spec ||
      spec.type !== type ||
      spec.components !== components ||
      !Number.isInteger(spec.offset) ||
      spec.offset % 4 !== 0 ||
      spec.offset < end
    ) {
      throw new WorldCloudError(`array ${name} must be ${type} x ${components}`);
    }
  }
  const { min, scale } = header.quantization ?? {};
  if (![min, scale].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) {
    throw new WorldCloudError("bad quantization");
  }
  return header;
}

const ARRAYS: [name: string, type: "uint8" | "uint16", components: number][] = [
  ["position", "uint16", 3],
  ["color", "uint8", 3],
  ["tree", "uint16", 1],
];

// Byte range [start, end) of the first `count` points of an array (the file is
// stored in a shuffled order, so any first `count` points are an even sample).
export function arrayRange(
  header: WorldCloudHeader,
  name: "position" | "color" | "tree",
  from: number,
  to: number,
): [number, number] {
  const [, type, components] = ARRAYS.find((a) => a[0] === name)!;
  const spec = header.arrays[name];
  const size = BYTES[type] * components;
  return [spec.offset + from * size, spec.offset + to * size];
}

// The first `count` points from the bytes of their three arrays (each starting
// at its first point; a whole file's arrays or ranged parts of them).
export function assembleCloud(
  header: WorldCloudHeader,
  count: number,
  bytes: { position: ArrayBuffer; color: ArrayBuffer; tree: ArrayBuffer },
): WorldCloud {
  if (count > header.point_count) throw new WorldCloudError("more points than the file has");
  if (
    bytes.position.byteLength < count * 6 ||
    bytes.color.byteLength < count * 3 ||
    bytes.tree.byteLength < count * 2
  ) {
    throw new WorldCloudError("array out of bounds");
  }
  const q = new Uint16Array(bytes.position, 0, count * 3);
  const color = new Uint8Array(bytes.color, 0, count * 3);
  const tree = new Uint16Array(bytes.tree, 0, count);
  const { min, scale } = header.quantization;
  const enu = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    enu[i] = min[0] + q[i] * scale[0];
    enu[i + 1] = min[1] + q[i + 1] * scale[1];
    enu[i + 2] = min[2] + q[i + 2] * scale[2];
  }
  const treeIds = new Map<number, string>();
  for (const t of header.trees ?? []) treeIds.set(t.index, t.tree_id);
  return { header, count, enu, color, tree, treeIds };
}

// The optional winter arrays: name, type, components, which count they follow.
const SKELETON_ARRAYS: [string, "uint8" | "uint16", number, "segment" | "cut"][] = [
  ["segment_a", "uint16", 3, "segment"],
  ["segment_b", "uint16", 3, "segment"],
  ["segment_radius", "uint16", 1, "segment"],
  ["segment_tree", "uint16", 1, "segment"],
  ["segment_kind", "uint8", 1, "segment"],
  ["cut_position", "uint16", 3, "cut"],
  ["cut_diameter", "uint16", 1, "cut"],
  ["cut_tree", "uint16", 1, "cut"],
];

function skeletonCounts(header: WorldCloudHeader) {
  const segment = header.segment_count ?? 0;
  const cut = header.cut_count ?? 0;
  if (![segment, cut].every((n) => Number.isInteger(n) && n >= 0)) {
    throw new WorldCloudError("bad segment_count or cut_count");
  }
  return { segment, cut };
}

// Byte range [start, end) of the winter arrays (they close the file); null
// when the file has none.
export function skeletonRange(header: WorldCloudHeader): [number, number] | null {
  const counts = skeletonCounts(header);
  if (counts.segment === 0 && counts.cut === 0) return null;
  let start = Infinity;
  let end = 0;
  for (const [name, type, components, of] of SKELETON_ARRAYS) {
    const spec = header.arrays?.[name];
    const n = counts[of];
    if (n === 0) continue;
    if (!spec || spec.type !== type || spec.components !== components || spec.offset % 4 !== 0) {
      throw new WorldCloudError(`array ${name} must be ${type} x ${components}`);
    }
    start = Math.min(start, spec.offset);
    end = Math.max(end, spec.offset + n * components * BYTES[type]);
  }
  return [start, end];
}

// The winter arrays from `bytes`, which hold the file from offset `base`.
export function assembleSkeleton(
  header: WorldCloudHeader,
  bytes: ArrayBuffer,
  base: number,
): WorldSkeleton {
  const counts = skeletonCounts(header);
  const { min, scale } = header.quantization;
  const get = (name: string, type: "uint8" | "uint16", components: number, n: number) => {
    if (n === 0) return type === "uint16" ? new Uint16Array(0) : new Uint8Array(0);
    const at = header.arrays[name].offset - base;
    const length = n * components;
    if (at < 0 || at + length * BYTES[type] > bytes.byteLength) {
      throw new WorldCloudError(`array ${name} out of bounds`);
    }
    return type === "uint16"
      ? new Uint16Array(bytes.slice(at, at + length * 2))
      : new Uint8Array(bytes.slice(at, at + length));
  };
  const enu = (q: Uint16Array) => {
    const out = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 3) {
      out[i] = min[0] + q[i] * scale[0];
      out[i + 1] = min[1] + q[i + 1] * scale[1];
      out[i + 2] = min[2] + q[i + 2] * scale[2];
    }
    return out;
  };
  const metres = (mm: Uint16Array) => Float32Array.from(mm, (v) => v / 1000);
  const s = counts.segment;
  const c = counts.cut;
  return {
    segmentCount: s,
    a: enu(get("segment_a", "uint16", 3, s) as Uint16Array),
    b: enu(get("segment_b", "uint16", 3, s) as Uint16Array),
    radius: metres(get("segment_radius", "uint16", 1, s) as Uint16Array),
    tree: get("segment_tree", "uint16", 1, s) as Uint16Array,
    kind: get("segment_kind", "uint8", 1, s) as Uint8Array,
    cutCount: c,
    cutPosition: enu(get("cut_position", "uint16", 3, c) as Uint16Array),
    cutDiameter: metres(get("cut_diameter", "uint16", 1, c) as Uint16Array),
    cutTree: get("cut_tree", "uint16", 1, c) as Uint16Array,
  };
}

export function parseWorldCloud(buffer: ArrayBuffer): WorldCloud {
  const header = parseHeader(buffer);
  const n = header.point_count;
  const slice = (name: "position" | "color" | "tree") => {
    const [a, b] = arrayRange(header, name, 0, n);
    if (b > buffer.byteLength) throw new WorldCloudError(`array ${name} out of bounds`);
    return buffer.slice(a, b);
  };
  const cloud = assembleCloud(header, n, {
    position: slice("position"),
    color: slice("color"),
    tree: slice("tree"),
  });
  cloud.skeleton = skeletonRange(header) ? assembleSkeleton(header, buffer, 0) : null;
  return cloud;
}

// Builds a file in the same layout (tests and fixtures). The winter arrays
// are written when `skeleton` is given.
export interface EncodedSkeleton {
  segments: {
    a: [number, number, number];
    b: [number, number, number];
    radiusMm: number;
    tree: number;
    kind: number;
  }[];
  cuts: { q: [number, number, number]; diameterMm: number; tree: number }[];
}

export function encodeWorldCloud(
  header: Omit<WorldCloudHeader, "arrays" | "point_count" | "schema">,
  points: { q: [number, number, number]; rgb: [number, number, number]; tree: number }[],
  skeleton?: EncodedSkeleton,
): ArrayBuffer {
  const n = points.length;
  const arrays: [string, "uint8" | "uint16", number, number[]][] = [
    ["position", "uint16", 3, points.flatMap((p) => p.q)],
    ["color", "uint8", 3, points.flatMap((p) => p.rgb)],
    ["tree", "uint16", 1, points.map((p) => p.tree)],
  ];
  const extra: Record<string, unknown> = {};
  if (skeleton) {
    const sg = skeleton.segments;
    const ct = skeleton.cuts;
    extra.segment_count = sg.length;
    extra.cut_count = ct.length;
    arrays.push(
      ["segment_a", "uint16", 3, sg.flatMap((x) => x.a)],
      ["segment_b", "uint16", 3, sg.flatMap((x) => x.b)],
      ["segment_radius", "uint16", 1, sg.map((x) => x.radiusMm)],
      ["segment_tree", "uint16", 1, sg.map((x) => x.tree)],
      ["segment_kind", "uint8", 1, sg.map((x) => x.kind)],
      ["cut_position", "uint16", 3, ct.flatMap((x) => x.q)],
      ["cut_diameter", "uint16", 1, ct.map((x) => x.diameterMm)],
      ["cut_tree", "uint16", 1, ct.map((x) => x.tree)],
    );
  }
  const align = (x: number) => Math.ceil(x / 4) * 4;
  const draft = (offsets: number[]) =>
    new TextEncoder().encode(
      JSON.stringify({
        ...header,
        ...extra,
        schema: WORLD_CLOUD_SCHEMA,
        point_count: n,
        arrays: Object.fromEntries(
          arrays.map(([name, type, components], i) => [
            name,
            { offset: offsets[i], type, components },
          ]),
        ),
      }),
    );
  // Offsets depend on the header length, which depends on the offsets:
  // iterate to the fixed point (a few rounds at most).
  let offsets = arrays.map(() => 0);
  let json = draft(offsets);
  for (;;) {
    const next: number[] = [];
    let at = align(8 + json.length);
    for (const [, type, , values] of arrays) {
      next.push(at);
      at = align(at + values.length * BYTES[type]);
    }
    if (next.every((v, i) => v === offsets[i])) break;
    offsets = next;
    json = draft(offsets);
  }
  const last = arrays.length - 1;
  const total = align(offsets[last] + arrays[last][3].length * BYTES[arrays[last][1]]);
  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode(WORLD_CLOUD_MAGIC), 0);
  new DataView(buffer).setUint32(4, json.length, true);
  bytes.set(json, 8);
  arrays.forEach(([, type, , values], i) => {
    const view =
      type === "uint16"
        ? new Uint16Array(buffer, offsets[i], values.length)
        : new Uint8Array(buffer, offsets[i], values.length);
    view.set(values);
  });
  return buffer;
}
