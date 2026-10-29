// docs/hukuk/kararlar.md H33: the sign-up's code step answers in about the
// same time whether the phone is new, belongs to an account or cannot get a
// code at all (a profile phone without a login). Sending a code goes through
// Auth and the SMS hook; the floor covers that.
export const CODE_STEP_MIN_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves once `minMs` has passed since `startedMs`.
export async function waitAtLeast(startedMs: number, minMs: number): Promise<void> {
  const left = startedMs + minMs - Date.now();
  if (left > 0) await sleep(left);
}
