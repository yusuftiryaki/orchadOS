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
}

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

export function parseWorldCloud(buffer: ArrayBuffer): WorldCloud {
  const header = parseHeader(buffer);
  const n = header.point_count;
  const slice = (name: "position" | "color" | "tree") => {
    const [a, b] = arrayRange(header, name, 0, n);
    if (b > buffer.byteLength) throw new WorldCloudError(`array ${name} out of bounds`);
    return buffer.slice(a, b);
  };
  return assembleCloud(header, n, {
    position: slice("position"),
    color: slice("color"),
    tree: slice("tree"),
  });
}

// Builds a file in the same layout (tests and fixtures).
export function encodeWorldCloud(
  header: Omit<WorldCloudHeader, "arrays" | "point_count" | "schema">,
  points: { q: [number, number, number]; rgb: [number, number, number]; tree: number }[],
): ArrayBuffer {
  const n = points.length;
  const align = (x: number) => Math.ceil(x / 4) * 4;
  const draft = (offsets: number[]) =>
    new TextEncoder().encode(
      JSON.stringify({
        ...header,
        schema: WORLD_CLOUD_SCHEMA,
        point_count: n,
        arrays: {
          position: { offset: offsets[0], type: "uint16", components: 3 },
          color: { offset: offsets[1], type: "uint8", components: 3 },
          tree: { offset: offsets[2], type: "uint16", components: 1 },
        },
      }),
    );
  // Offsets depend on the header length, which depends on the offsets:
  // iterate to the fixed point (a few rounds at most).
  let offsets = [0, 0, 0];
  let json = draft(offsets);
  for (;;) {
    const p0 = align(8 + json.length);
    const p1 = align(p0 + n * 6);
    const next = [p0, p1, align(p1 + n * 3)];
    if (next.every((v, i) => v === offsets[i])) break;
    offsets = next;
    json = draft(offsets);
  }
  const [p0, p1, p2] = offsets;
  const total = align(p2 + n * 2);
  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode(WORLD_CLOUD_MAGIC), 0);
  new DataView(buffer).setUint32(4, json.length, true);
  bytes.set(json, 8);
  const pos = new Uint16Array(buffer, p0, n * 3);
  const col = new Uint8Array(buffer, p1, n * 3);
  const tr = new Uint16Array(buffer, p2, n);
  points.forEach((p, i) => {
    pos.set(p.q, i * 3);
    col.set(p.rgb, i * 3);
    tr[i] = p.tree;
  });
  return buffer;
}
