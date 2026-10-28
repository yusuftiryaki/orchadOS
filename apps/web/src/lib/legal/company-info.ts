import "server-only";
import { cache } from "react";
import type { CompanyFields } from "@/lib/legal/company-placeholders";
import { createClient } from "@/lib/supabase/server";

// The seller's company information (public_company_info, T21), once per
// request. A missing function (web deployed before the database), an error or
// no seller: null, and the texts and the footer keep their placeholders.
export const getCompanyInfo = cache(async (): Promise<CompanyFields | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("public_company_info");
    if (error || !data) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row ?? null;
  } catch {
    return null;
  }
});
