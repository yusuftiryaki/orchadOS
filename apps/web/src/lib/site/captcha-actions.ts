"use server";

import { fetchCaptchaChallenge, type CaptchaPurpose } from "./captcha";
import type { AltchaChallengeData } from "./altcha-solver";

// The self-hosted robot check's widget asks for its challenge here
// (components/site/turnstile.tsx). Challenges carry nothing personal.
export async function captchaChallengeAction(
  purpose: CaptchaPurpose,
): Promise<AltchaChallengeData | null> {
  if (purpose !== "signup" && purpose !== "demo") return null;
  return fetchCaptchaChallenge(purpose);
}
