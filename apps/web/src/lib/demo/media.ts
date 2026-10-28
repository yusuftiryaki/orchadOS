import "server-only";
import type { SessionUser } from "@/lib/auth/session";
import { supabaseEnv } from "@/lib/env";
import type { PublicMirror } from "@/lib/media/signer";
import { getDemoInfo } from "./session";

// Signer options of the signed-in user: a demo visitor's demo org files come
// from the public demo-media bucket (docs/demo-turu.md §11.6); everyone else
// gets nothing extra (signed as before, with the user-id scope).
export async function demoMediaOptions(
  user: SessionUser,
): Promise<{ publicMirror?: PublicMirror }> {
  if (!user.demo) return {};
  const info = await getDemoInfo();
  if (!info) return {};
  return { publicMirror: { orgId: info.orgId, baseUrl: supabaseEnv().url } };
}
