// The part of a MapLibre map the selection needs.
export interface FeatureStateTarget {
  getSource(id: string): unknown;
  setFeatureState(feature: { source: string; id: string | number }, state: object): unknown;
}

// Ids to clear and to set when a selection goes from `previous` to `next`.
export function selectionDiff(
  previous: readonly (string | number)[],
  next: readonly (string | number)[],
): { clear: (string | number)[]; set: (string | number)[] } {
  const before = new Set(previous);
  const after = new Set(next);
  return {
    clear: [...before].filter((id) => !after.has(id)),
    set: [...after].filter((id) => !before.has(id)),
  };
}

// Applies a selection as the `selected` feature state of a source (the
// source promotes the id; states survive setData); returns what is now shown.
export function syncSelection<T extends string | number>(
  map: FeatureStateTarget,
  source: string,
  previous: readonly T[],
  next: readonly T[],
): T[] {
  if (!map.getSource(source)) return [];
  const { clear, set } = selectionDiff(previous, next);
  for (const id of clear) map.setFeatureState({ source, id }, { selected: false });
  for (const id of set) map.setFeatureState({ source, id }, { selected: true });
  return [...next];
}
