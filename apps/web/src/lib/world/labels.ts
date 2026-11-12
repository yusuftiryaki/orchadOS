// Which tree labels the 3D world shows and which tree a click picks
// (docs/3d-dunya.md §10.3). Both depend on where one is: walking or close to
// a tree, only the trees around are labelled and pickable; from above, every
// tree whose label fits. A click picks the front-most tree whose silhouette
// it falls in, so a tree behind the one looked at cannot be picked through it.
// Pure functions on screen-space data the scene computes each frame.

// Walking: the trees within this many metres of where one stands.
export const NEAR_WALK_RADIUS_M = 15;
// Orbiting close to a tree ("Ağaca yaklaş"): within this many metres of the
// point the camera turns around.
export const NEAR_FOCUS_RADIUS_M = 10;
// The orbit counts as close below this camera distance to its target (the
// overview stands 28-90 m away, a flight to a tree 10-18 m).
export const NEAR_ORBIT_DISTANCE_M = 25;
export const NEAR_MAX_LABELS = 8;
// From above: labels that do not overlap a nearer one, at most this many.
export const FAR_MAX_LABELS = 80;
// A label's footprint for the overlap test (CSS pixels; world.module.css).
export const LABEL_W_PX = 76;
export const LABEL_H_PX = 26;
// A click this close to a silhouette still hits it; without any hit, the
// tree whose middle is this close is taken.
const HIT_SLACK_PX = 6;
const FALLBACK_PX = 24;

// A screen area the world's own controls cover (CSS pixels): a label there
// could be neither read nor clicked.
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type LabelScope = { kind: "near"; radiusM: number } | { kind: "far" };

export interface TreeOnScreen {
  id: string;
  // Label anchor (the tree top), CSS pixels.
  x: number;
  y: number;
  // Camera distance, metres.
  depth: number;
  // Ground distance from where one stands or looks, metres.
  focusDistM: number;
  // The top (the label anchor) is on screen and in front of the camera.
  inView: boolean;
  // Some of the silhouette is on screen, in front of the camera: walking
  // under a tall tree, its top can be off screen while its trunk is not.
  boxInView: boolean;
  // The tree's silhouette on screen: ground to top, crown width.
  box: { left: number; right: number; top: number; bottom: number };
}

export function labelScope(navigation: "orbit" | "walk", orbitDistanceM: number): LabelScope {
  if (navigation === "walk") return { kind: "near", radiusM: NEAR_WALK_RADIUS_M };
  if (orbitDistanceM < NEAR_ORBIT_DISTANCE_M) {
    return { kind: "near", radiusM: NEAR_FOCUS_RADIUS_M };
  }
  return { kind: "far" };
}

function inScope(tree: TreeOnScreen, scope: LabelScope): boolean {
  return scope.kind === "far" || tree.focusDistM <= scope.radiusM;
}

// A label stands centred above its anchor.
function labelRect(t: { x: number; y: number }): Rect {
  return {
    left: t.x - LABEL_W_PX / 2,
    right: t.x + LABEL_W_PX / 2,
    top: t.y - LABEL_H_PX,
    bottom: t.y,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// The labels to draw, nearest first. The selected tree's label is always
// drawn when it is on screen. No label is drawn under the world's controls
// (`covered`).
export function chooseLabels(
  trees: TreeOnScreen[],
  scope: LabelScope,
  selectedId: string | null,
  covered: Rect[] = [],
): string[] {
  const visible = trees
    .filter((t) => t.inView && !covered.some((c) => intersects(labelRect(t), c)))
    .sort((a, b) => a.depth - b.depth);
  const selected = visible.find((t) => t.id === selectedId) ?? null;
  const out: string[] = selected ? [selected.id] : [];
  if (scope.kind === "near") {
    for (const tree of visible) {
      if (out.length >= NEAR_MAX_LABELS) break;
      if (tree.id !== selectedId && inScope(tree, scope)) out.push(tree.id);
    }
    return out;
  }
  // From above: a label is drawn unless a nearer one already covers its place.
  const placed: { x: number; y: number }[] = selected ? [selected] : [];
  for (const tree of visible) {
    if (out.length >= FAR_MAX_LABELS) break;
    if (tree.id === selectedId) continue;
    const overlaps = placed.some(
      (p) => Math.abs(p.x - tree.x) < LABEL_W_PX && Math.abs(p.y - tree.y) < LABEL_H_PX,
    );
    if (overlaps) continue;
    placed.push(tree);
    out.push(tree.id);
  }
  return out;
}

// The tree a click at (x, y) picks: among the silhouettes it falls in, the
// front-most; without one, the tree whose middle is nearest within a few
// pixels. Out of scope trees (far away while walking or close to a tree) are
// not picked. Null: nothing there.
export function pickTree(
  trees: TreeOnScreen[],
  x: number,
  y: number,
  scope: LabelScope,
): { id: string; depth: number } | null {
  const candidates = trees.filter((t) => t.boxInView && inScope(t, scope));
  let best: TreeOnScreen | null = null;
  for (const t of candidates) {
    const b = t.box;
    const hit =
      x >= b.left - HIT_SLACK_PX &&
      x <= b.right + HIT_SLACK_PX &&
      y >= b.top - HIT_SLACK_PX &&
      y <= b.bottom + HIT_SLACK_PX;
    if (hit && (!best || t.depth < best.depth)) best = t;
  }
  if (best) return { id: best.id, depth: best.depth };
  let nearest: TreeOnScreen | null = null;
  let nearestPx = FALLBACK_PX;
  for (const t of candidates) {
    const mx = (t.box.left + t.box.right) / 2;
    const my = (t.box.top + t.box.bottom) / 2;
    const d = Math.hypot(mx - x, my - y);
    if (d <= nearestPx) {
      nearest = t;
      nearestPx = d;
    }
  }
  return nearest ? { id: nearest.id, depth: nearest.depth } : null;
}
