// What demo_info() returns to a demo visitor (docs/demo-turu.md §5.2), and
// its parsing. Pure: the guided tour and the tests use it too.

export interface DemoTour {
  parcel_id?: string;
  tree_id?: string;
  session_id?: string;
  previous_session_id?: string;
  inventory_session_id?: string;
}

export interface DemoInfo {
  orgId: string;
  expiresAt: string;
  tour: DemoTour;
  parcels: { id: string; name: string }[];
}

const str = (v: unknown): v is string => typeof v === "string" && v !== "";

export function parseDemoInfo(value: unknown): DemoInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!str(v.org_id) || !str(v.expires_at)) return null;
  const tour: DemoTour = {};
  if (v.tour && typeof v.tour === "object" && !Array.isArray(v.tour)) {
    for (const key of [
      "parcel_id",
      "tree_id",
      "session_id",
      "previous_session_id",
      "inventory_session_id",
    ] as const) {
      const item = (v.tour as Record<string, unknown>)[key];
      if (str(item)) tour[key] = item;
    }
  }
  const parcels = Array.isArray(v.parcels)
    ? v.parcels.flatMap((p) =>
        p && typeof p === "object" && str((p as { id?: unknown }).id)
          ? [
              {
                id: (p as { id: string }).id,
                name: String((p as { name?: unknown }).name ?? ""),
              },
            ]
          : [],
      )
    : [];
  return { orgId: v.org_id, expiresAt: v.expires_at, tour, parcels };
}

// The session is over: no info, or its end has passed.
export function demoExpired(info: DemoInfo | null, now = Date.now()): boolean {
  return !info || !(Date.parse(info.expiresAt) > now);
}
