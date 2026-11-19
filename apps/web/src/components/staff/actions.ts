"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { decideRegistration, type DecideResult } from "@/lib/lidar/registration";
import { createClient } from "@/lib/supabase/server";

// Ops' decision on a LiDAR registration in review, from the band of the staff
// world (registration-band.tsx). The database function decides who may: ops
// of the run's org, once, with a note to reject.
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
