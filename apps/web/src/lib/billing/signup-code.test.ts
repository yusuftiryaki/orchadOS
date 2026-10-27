import { describe, expect, it } from "vitest";
import { requestSignupCode, type SignupCodeAuth } from "./signup-code";

type Err = { code?: string };

function fakeAuth(signInError: Err | null, resendError: Err | null = null) {
  const calls: string[] = [];
  const auth: SignupCodeAuth<Err> = {
    async signInWithOtp() {
      calls.push("signInWithOtp");
      return { error: signInError };
    },
    async resend() {
      calls.push("resend");
      return { error: resendError };
    },
  };
  return { auth, calls };
}

describe("requestSignupCode", () => {
  it("asks for the phone confirmation code when the new phone is refused as a sign-up", async () => {
    const { auth, calls } = fakeAuth({ code: "signup_disabled" });
    expect(await requestSignupCode(auth, "+905551234567")).toBeNull();
    expect(calls).toEqual(["signInWithOtp", "resend"]);
  });

  it("signs a verified phone in without resend", async () => {
    const { auth, calls } = fakeAuth(null);
    expect(await requestSignupCode(auth, "+905551234567")).toBeNull();
    expect(calls).toEqual(["signInWithOtp"]);
  });

  it("passes other errors on", async () => {
    const limited = fakeAuth({ code: "over_sms_send_rate_limit" });
    expect(await requestSignupCode(limited.auth, "+905551234567")).toEqual({
      code: "over_sms_send_rate_limit",
    });
    expect(limited.calls).toEqual(["signInWithOtp"]);
    const resendFails = fakeAuth({ code: "signup_disabled" }, { code: "over_sms_send_rate_limit" });
    expect(await requestSignupCode(resendFails.auth, "+905551234567")).toEqual({
      code: "over_sms_send_rate_limit",
    });
  });
});
