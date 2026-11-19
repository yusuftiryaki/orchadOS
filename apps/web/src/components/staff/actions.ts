"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { decideRegistration, type DecideResult } from "@/lib/lidar/registration";
import { createClient } from "@/lib/supabase/server";

// Ops' decision on a LiDAR registration in review, from the band of the staff
// world (registration-band.tsx) or a row of the ops dashboard's list
// (operations/lidar-registrations.tsx). The database function decides who
// may: ops of the run's org, once, with a note to reject, not for a run older
// than the visit's accepted one (newer_accepted; messages in
// t.lidarRegistration.errors).
export async function decideLidarRegistrationAction(
  id: unknown,
  accept: unknown,
  note: unknown,
): Promise<DecideResult> {
  const user = await requireUser();
  if (!user.roles.orgRoles.includes("ops")) return { ok: false, error: "forbidden" };
  const result = await decideRegistration(await createClient(), { id, accept, note });
  // The dashboard's list of runs in review.
  if (result.ok) revalidatePath("/operasyon");
  return result;
}
