import type { Client } from "@/lib/supabase/types";

// Upcoming planned visits of a parcel for its owner, with the postponement
// state (my_parcel_visits; docs/hukuk/kararlar.md H15, contract 8A/1). Empty
// for anyone else.
export interface UpcomingVisit {
  sessionId: string;
  kind: "inventory" | "periodic_scan";
  plannedDate: string;
  postponed: boolean;
  canPostpone: boolean;
}

export async function listUpcomingVisits(
  supabase: Client,
  parcelId: string,
): Promise<UpcomingVisit[]> {
  const { data, error } = await supabase.rpc("my_parcel_visits", { p_parcel_id: parcelId });
  if (error) return [];
  return (data ?? []).flatMap((v) =>
    v.kind === "inventory" || v.kind === "periodic_scan"
      ? [
          {
            sessionId: v.session_id,
            kind: v.kind,
            plannedDate: v.planned_date,
            postponed: v.postponed,
            canPostpone: v.can_postpone,
          },
        ]
      : [],
  );
}
