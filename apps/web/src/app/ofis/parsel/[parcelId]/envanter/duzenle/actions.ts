"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/session";
import {
  addZone,
  closeVerificationItem,
  createVerificationTour,
  deleteZone,
  recordVerificationResult,
  saveBoundary,
  setTreeAttributes,
  type EditResult,
} from "@/lib/office/inventory-edits";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/supabase/types";

// Writes of the inventory workspace, as the signed-in user (row level
// security and the database functions decide; no service key). Input is
// checked in src/lib/office/inventory-edits.ts.

function revalidate(parcelId: unknown) {
  if (typeof parcelId !== "string") return;
  revalidatePath(`/ofis/parsel/${parcelId}/envanter/duzenle`);
  for (const section of ["ofis", "operasyon", "uzman", "portal"]) {
    revalidatePath(`/${section}/parsel/${parcelId}`);
  }
}

async function run<T extends object>(
  input: unknown,
  edit: (supabase: Client, input: unknown) => Promise<EditResult<T>>,
): Promise<EditResult<T>> {
  await requireSection("ofis");
  const result = await edit(await createClient(), input);
  if (result.ok) revalidate((input as { parcelId?: unknown } | null)?.parcelId);
  return result;
}

export async function setTreeAttributesAction(input: unknown) {
  return run(input, setTreeAttributes);
}

export async function addZoneAction(input: unknown) {
  return run(input, addZone);
}

export async function deleteZoneAction(input: unknown) {
  return run(input, deleteZone);
}

export async function saveBoundaryAction(input: unknown) {
  return run(input, saveBoundary);
}

export async function createVerificationTourAction(input: unknown) {
  return run(input, createVerificationTour);
}

export async function recordVerificationResultAction(input: unknown) {
  return run(input, recordVerificationResult);
}

export async function closeVerificationItemAction(input: unknown) {
  return run(input, closeVerificationItem);
}
