import { notFound } from "next/navigation";
import { bulkMessages } from "@/components/expert/bulk-approve";
import { SummaryView } from "@/components/expert/summary-view";
import { OwnWorkNotice } from "@/components/services/own-work-notice";
import { requireSection } from "@/lib/auth/session";
import { followupMessage, listFollowups } from "@/lib/expert/followups";
import { loadPipelineChecks } from "@/lib/expert/pipeline-checks";
import { loadReview } from "@/lib/expert/review";
import { loadOwnWork } from "@/lib/services/data";
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

  const [followups, checks, ownWork] = await Promise.all([
    listFollowups(supabase, { parcelIds: [ctx.session.parcelId] }),
    loadPipelineChecks(supabase, sessionId),
    // IP15 independence: orchadOS mowing before this visit.
    loadOwnWork(supabase, ctx.session.parcelId, ctx.session.time),
  ]);

  const findingError =
    typeof query.bulgu_hata === "string"
      ? (t.expert.findings.errors[query.bulgu_hata] ?? t.expert.findings.errors.write_failed)
      : null;
  return (
    <SummaryView
      ctx={ctx}
      findingError={findingError}
      published={query.yayin === "1"}
      bulk={bulkMessages(query)}
      followups={followups.filter((f) => f.sourceSessionId === sessionId)}
      followupMessage={followupMessage(query)}
      checks={checks}
      notice={<OwnWorkNotice days={ownWork} />}
    />
  );
}
