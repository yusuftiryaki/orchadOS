"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { safeNextPath } from "./login-methods";

export interface LoginState {
  error: string | null;
}

export async function signInWithPassword(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: t.login.missingFields };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: t.login.invalidCredentials };

  redirect(safeNextPath(formData.get("next")));
}
