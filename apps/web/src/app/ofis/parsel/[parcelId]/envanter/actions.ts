"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/session";
import { saveInventory, type SaveInventoryResult } from "@/lib/office/inventory";
import { createClient } from "@/lib/supabase/server";

// Saves the office tool's result as the signed-in user (row level security
// applies; no service key). The input is validated and the codes recomputed
// inside saveInventory.
export async function saveInventoryAction(input: unknown): Promise<SaveInventoryResult> {
  await requireSection("ofis");
  const supabase = await createClient();
  const result = await saveInventory(supabase, input);
  if (result.ok) {
    const parcelId = (input as { parcelId: string }).parcelId;
    for (const section of ["ofis", "operasyon", "uzman", "portal"]) {
      revalidatePath(`/${section}/parsel/${parcelId}`);
    }
  }
  return result;
}
