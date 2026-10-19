import type { Numbering } from "./rows";
import type { TriangulationWarning } from "./triangulate";

// Work in progress of the office tool, kept in the browser's localStorage per
// parcel and inventory session until it is saved to the database. Triangulating
// a parcel takes most of an hour; a reload must not lose it.

export interface DraftRay {
  panoramaId: string;
  azimuthDeg: number;
  pitchDeg: number;
}

export interface DraftTree {
  id: string;
  lat: number;
  lon: number;
  uncertaintyM: number;
  warnings: TriangulationWarning[];
  unsure: boolean;
  // Dragged on the map after triangulation.
  moved: boolean;
  // The clicks behind the position: labelled data for a future trunk detector.
  rays: DraftRay[];
}

export interface Draft {
  version: 1;
  trees: DraftTree[];
  numbering: Numbering | null;
}

export function loadDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    return draft.version === 1 && Array.isArray(draft.trees) ? draft : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: { trees: DraftTree[]; numbering: Numbering }) {
  try {
    if (value.trees.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify({ version: 1, ...value }));
  } catch {
    // Storage full or disabled: the tool keeps working without a draft.
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
