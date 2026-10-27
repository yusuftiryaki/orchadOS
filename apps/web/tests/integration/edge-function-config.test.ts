import { existsSync, readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";

// Every Edge Function in supabase/config.toml is enabled and has its index.ts,
// so the local stack and CI serve it (IP12: the payment functions of IP12-B
// must not stay switched off once their code lands).

const root = new URL("../../../../supabase/", import.meta.url);
const config = readFileSync(new URL("config.toml", root), "utf8");

// [functions.<name>] sections with their body up to the next section.
const functions = [...config.matchAll(/^\[functions\.([a-z0-9-]+)\]\n([\s\S]*?)(?=^\[)/gm)].map(
  ([, name, section]) => ({ name, section }),
);

describe("Edge Function configuration", () => {
  it("lists the IP12 functions", () => {
    expect(functions.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        "customer-signup",
        "payments",
        "payment-callback",
        "payment-webhook",
      ]),
    );
  });

  it.each(functions)("$name is enabled and has its code", ({ name, section }) => {
    expect(section).not.toMatch(/^\s*enabled\s*=\s*false/m);
    expect(existsSync(new URL(`functions/${name}/index.ts`, root))).toBe(true);
  });

  it("the IP12 functions check their callers in code", () => {
    for (const name of ["customer-signup", "payments", "payment-callback", "payment-webhook"]) {
      expect(functions.find((f) => f.name === name)?.section, name).toMatch(
        /^verify_jwt = false$/m,
      );
    }
  });

  it.each(["payments", "payment-callback", "payment-webhook"])("%s is served", async (name) => {
    const res = await fetch(`${inject("supabase").url}/functions/v1/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      // payment-callback answers with a redirect to the portal, which is not
      // running here: the redirect itself shows the function is served.
      redirect: "manual",
    });
    await res.body?.cancel();
    expect(res.status).not.toBe(404);
  });
});
