import type { Database } from "@/lib/database.types";
import { Constants } from "@/lib/database.types";
import { LocalFrame, type LatLon } from "./local-frame";
import { DEFAULT_TRIANGULATION } from "./triangulate";

// Verification list from a saved inventory (MVP Module 2, step 8): what the
// office tool listed before saving, recomputed from the database so that a
// tour can be created later, from any browser. Triangulation warnings and the
// off-row flag are not stored; the office adds such slots by hand.

export type VerificationReason = Database["public"]["Enums"]["verification_reason"];
export const VERIFICATION_REASONS: readonly VerificationReason[] =
  Constants.public.Enums.verification_reason;

// Same limit as the office tool's list.
export const MAX_UNCERTAINTY_M = DEFAULT_TRIANGULATION.maxUncertaintyM;
// An interstitial tree this close to another tree is probably a second stem.
export const MULTI_STEM_M = 1.0;

export interface CandidateSlot {
  id: string;
  code: string;
  kind: Database["public"]["Enums"]["slot_kind"];
  position: LatLon | null;
  uncertaintyM: number | null;
  treeId: string | null;
  // Any trunk label of the tree was marked "not sure".
  unsure: boolean;
}

export interface VerificationCandidate {
  slotId: string;
  code: string;
  treeId: string | null;
  reasons: VerificationReason[];
}

export function sortReasons(reasons: Iterable<VerificationReason>): VerificationReason[] {
  const set = new Set(reasons);
  return VERIFICATION_REASONS.filter((r) => set.has(r));
}

export function verificationCandidates(
  slots: CandidateSlot[],
  options: { maxUncertaintyM?: number; multiStemM?: number; exclude?: Set<string> } = {},
): VerificationCandidate[] {
  const maxUncertainty = options.maxUncertaintyM ?? MAX_UNCERTAINTY_M;
  const multiStem = options.multiStemM ?? MULTI_STEM_M;
  const withTree = slots.filter((s) => s.treeId && s.position);
  const frame = withTree.length
    ? new LocalFrame(withTree[0].position!.lat, withTree[0].position!.lon)
    : null;
  const near = (s: CandidateSlot) => {
    if (!frame || !s.position) return false;
    const p = frame.toLocal(s.position);
    return withTree.some((o) => {
      if (o.id === s.id) return false;
      const q = frame.toLocal(o.position!);
      return Math.hypot(p.x - q.x, p.y - q.y) < multiStem;
    });
  };

  const out: VerificationCandidate[] = [];
  for (const s of slots) {
    if (options.exclude?.has(s.id)) continue;
    const reasons = new Set<VerificationReason>();
    if (s.treeId) {
      if (s.unsure) reasons.add("unsure");
      if ((s.uncertaintyM ?? 0) > maxUncertainty) reasons.add("high_uncertainty");
      if (s.kind === "interstitial" && near(s)) reasons.add("multi_stem");
    } else {
      reasons.add("empty_slot");
    }
    if (reasons.size === 0) continue;
    out.push({ slotId: s.id, code: s.code, treeId: s.treeId, reasons: sortReasons(reasons) });
  }
  return out;
}
