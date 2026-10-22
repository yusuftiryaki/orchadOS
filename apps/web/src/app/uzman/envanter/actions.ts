"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/session";
import {
  approveInventory,
  waiveCoverage,
  type ApproveInventoryResult,
  type WaiveCoverageResult,
} from "@/lib/expert/inventory";
import {
  closeVerificationItem,
  setTreeAttributes,
  type EditResult,
} from "@/lib/office/inventory-edits";
import { createClient } from "@/lib/supabase/server";

// Server actions of the inventory approval screen, as the signed-in expert:
// approve_inventory() and row level security decide.

function revalidate(parcelId: unknown, sessionId?: unknown) {
  if (typeof sessionId === "string") revalidatePath(`/uzman/envanter/${sessionId}`);
  revalidatePath("/uzman");
  if (typeof parcelId !== "string") return;
  revalidatePath(`/ofis/parsel/${parcelId}/envanter/duzenle`);
  for (const section of ["ofis", "operasyon", "uzman", "portal"]) {
    revalidatePath(`/${section}/parsel/${parcelId}`);
  }
}

export async function approveInventoryAction(
  parcelId: unknown,
  sessionId: unknown,
): Promise<ApproveInventoryResult> {
  await requireSection("uzman");
  const result = await approveInventory(await createClient(), sessionId);
  if (result.ok) revalidate(parcelId, sessionId);
  return result;
}

export async function waiveCoverageAction(
  parcelId: unknown,
  sessionId: unknown,
  note: unknown,
): Promise<WaiveCoverageResult> {
  await requireSection("uzman");
  const result = await waiveCoverage(await createClient(), sessionId, note);
  if (result.ok) revalidate(parcelId, sessionId);
  return result;
}

export async function setTreeAttributesExpertAction(input: unknown): Promise<EditResult> {
  await requireSection("uzman");
  const result = await setTreeAttributes(await createClient(), input);
  if (result.ok) revalidate((input as { parcelId?: unknown } | null)?.parcelId);
  return result;
}

export async function closeVerificationItemExpertAction(input: unknown): Promise<EditResult> {
  await requireSection("uzman");
  const result = await closeVerificationItem(await createClient(), input);
  if (result.ok) revalidate((input as { parcelId?: unknown } | null)?.parcelId);
  return result;
}
