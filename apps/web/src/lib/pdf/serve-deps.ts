import "server-only";
import { demoGate, getSessionUser } from "@/lib/auth/session";
import { cachedDemoPdf } from "@/lib/demo/pdf-cache";
import { getDemoInfo } from "@/lib/demo/session";
import { createClient } from "@/lib/supabase/server";
import type { PdfDeps } from "./serve";

// The real dependencies of servePdf (lib/pdf/serve.ts).
export const pdfDeps: PdfDeps = {
  user: getSessionUser,
  demoGate,
  async demoHit() {
    const { data, error } = await (await createClient()).rpc("demo_hit", { p_kind: "pdf" });
    return !error && data === true;
  },
  demoInfo: getDemoInfo,
  cached: cachedDemoPdf,
};
