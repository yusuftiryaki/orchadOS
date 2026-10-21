"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/session";
import { approveBoundary, type ApproveBoundaryResult } from "@/lib/portal/boundary";
import { createClient } from "@/lib/supabase/server";

// The owner approves the surveyed boundary (approve_boundary(): owners of the
// parcel only; viewers and org roles are refused).
export async function approveBoundaryAction(
  parcelId: unknown,
  boundaryId: unknown,
): Promise<ApproveBoundaryResult> {
  await requireSection("portal");
  const result = await approveBoundary(await createClient(), boundaryId);
  if (result.ok && typeof parcelId === "string") {
    for (const section of ["portal", "ofis", "operasyon", "uzman"]) {
      revalidatePath(`/${section}/parsel/${parcelId}`);
    }
    revalidatePath(`/ofis/parsel/${parcelId}/envanter/duzenle`);
  }
  return result;
}
