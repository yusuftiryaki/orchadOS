import { notFound } from "next/navigation";
import { SummaryView } from "@/components/expert/summary-view";
import { requireSection } from "@/lib/auth/session";
import { loadReview } from "@/lib/expert/review";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

// Visit summary, findings on the parcel, report signature and publication.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("uzman");
  const { sessionId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const ctx = await loadReview(supabase, sessionId);
  if (!ctx) notFound();

  const findingError =
    typeof query.bulgu_hata === "string"
      ? (t.expert.findings.errors[query.bulgu_hata] ?? t.expert.findings.errors.write_failed)
      : null;
  return <SummaryView ctx={ctx} findingError={findingError} published={query.yayin === "1"} />;
}
