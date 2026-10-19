import "server-only";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadUserRoles } from "./load-roles";
import { canAccessSection, type Section, type UserRoles } from "./roles";

export interface SessionUser {
  id: string;
  email: string | null;
  roles: UserRoles;
}

// Once per request, shared by layouts and pages.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const roles = await loadUserRoles(supabase, claims.sub);
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null, roles };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/giris");
  return user;
}

// Called by both the section layout and its pages: a layout is not re-rendered
// on every navigation, so it cannot be the only gate.
export async function requireSection(section: Section): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccessSection(user.roles, section)) forbidden();
  return user;
}
