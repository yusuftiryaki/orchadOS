import { SEGMENT_PRUNED, type WorldCloud } from "./format";

// What the winter skeleton says per tree (docs/3d-dunya.md, Faz 2b): the cuts
// since the previous winter scan and the length of the wood they removed,
// read from the geometry the 3D world draws.

export interface TreeWinter {
  cuts: number;
  // Total length of the removed skeleton segments, metres.
  prunedLengthM: number;
}

export interface WinterSummary {
  segments: number;
  prunedSegments: number;
  cuts: number;
  // Compared with an earlier winter scan (the file carries pruning).
  pruning: boolean;
  byTree: Map<string, TreeWinter>;
}

export function winterSummary(cloud: WorldCloud): WinterSummary | null {
  const sk = cloud.skeleton;
  if (!sk) return null;
  const byTree = new Map<string, TreeWinter>();
  const of = (index: number) => {
    const id = cloud.treeIds.get(index);
    if (!id) return null;
    let t = byTree.get(id);
    if (!t) byTree.set(id, (t = { cuts: 0, prunedLengthM: 0 }));
    return t;
  };
  let pruned = 0;
  for (let i = 0; i < sk.segmentCount; i++) {
    if (sk.kind[i] !== SEGMENT_PRUNED) continue;
    pruned++;
    const t = of(sk.tree[i]);
    if (!t) continue;
    t.prunedLengthM += Math.hypot(
      sk.b[i * 3] - sk.a[i * 3],
      sk.b[i * 3 + 1] - sk.a[i * 3 + 1],
      sk.b[i * 3 + 2] - sk.a[i * 3 + 2],
    );
  }
  for (let i = 0; i < sk.cutCount; i++) {
    const t = of(sk.cutTree[i]);
    if (t) t.cuts++;
  }
  return {
    segments: sk.segmentCount,
    prunedSegments: pruned,
    cuts: sk.cutCount,
    pruning: !!cloud.header.skeleton?.pruning,
    byTree,
  };
}
