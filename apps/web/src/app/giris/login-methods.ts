// Sign-in methods offered on the login page. Phone (SMS OTP) sign-in comes
// later: enabling it means a form component for "phone" and a server action
// that calls supabase.auth.signInWithOtp / verifyOtp.
export type LoginMethod = "password" | "phone";

export const LOGIN_METHODS: { id: LoginMethod; enabled: boolean }[] = [
  { id: "password", enabled: true },
  { id: "phone", enabled: false },
];

// Only same-origin relative paths are allowed as a post-login target.
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
