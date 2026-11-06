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

export function parseWorldCloud(buffer: ArrayBuffer): WorldCloud {
  if (buffer.byteLength < 8) throw new WorldCloudError("file too short");
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== WORLD_CLOUD_MAGIC) throw new WorldCloudError(`unknown magic ${magic}`);
  const headerLength = view.getUint32(4, true);
  if (8 + headerLength > buffer.byteLength) throw new WorldCloudError("header past the end");
  let header: WorldCloudHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength)));
  } catch {
    throw new WorldCloudError("header is not JSON");
  }
  if (header?.schema !== WORLD_CLOUD_SCHEMA) {
    throw new WorldCloudError(`unknown schema ${String(header?.schema)}`);
  }
  const count = header.point_count;
  if (!Number.isInteger(count) || count < 0) throw new WorldCloudError("bad point_count");

  const array = (name: string, type: string, components: number) => {
    const spec = header.arrays?.[name];
    if (!spec || spec.type !== type || spec.components !== components) {
      throw new WorldCloudError(`array ${name} must be ${type} x ${components}`);
    }
    const length = count * components;
    if (
      !Number.isInteger(spec.offset) ||
      spec.offset % 4 !== 0 ||
      spec.offset < 8 + headerLength ||
      spec.offset + length * BYTES[type] > buffer.byteLength
    ) {
      throw new WorldCloudError(`array ${name} out of bounds`);
    }
    return type === "uint16"
      ? new Uint16Array(buffer, spec.offset, length)
      : new Uint8Array(buffer, spec.offset, length);
  };
  const q = array("position", "uint16", 3) as Uint16Array;
  const color = array("color", "uint8", 3) as Uint8Array;
  const tree = array("tree", "uint16", 1) as Uint16Array;

  const { min, scale } = header.quantization ?? {};
  if (![min, scale].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) {
    throw new WorldCloudError("bad quantization");
  }
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
