import { notFound } from "next/navigation";
import { ReviewView } from "@/components/expert/review-view";
import { requireSection } from "@/lib/auth/session";
import { loadReview, loadTreeDetail } from "@/lib/expert/review";
import { matchesFilter } from "@/lib/expert/summary";
import { parseFilter } from "@/lib/expert/urls";
import { t } from "@/lib/i18n";
import { createMediaSigner } from "@/lib/media/signer";
import { createClient } from "@/lib/supabase/server";

// Tree-by-tree review of one visit: ?filtre= list filter, ?agac= selected tree.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("uzman");
  const { sessionId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const ctx = await loadReview(supabase, sessionId);
  if (!ctx) notFound();

  const filter = parseFilter(query.filtre);
  const selected =
    ctx.trees.find((tree) => tree.id === query.agac) ??
    ctx.trees.find((tree) => matchesFilter(tree, filter)) ??
    null;
  const detail = selected
    ? await loadTreeDetail(
        supabase,
        ctx,
        selected.id,
        createMediaSigner(supabase, { scope: user.id }),
      )
    : null;

  const r = t.expert.review;
  let error: string | null = null;
  if (typeof query.hata === "string") {
    error = r.errors[query.hata] ?? r.errors.write_failed;
    if (typeof query.metrik === "string") {
      const [code, reason] = query.metrik.split(":");
      const metric = ctx.allMetrics.find((m) => m.code === code);
      const describe = r.metricError[reason as keyof typeof r.metricError];
      if (metric && describe) error = describe(metric.name);
    }
  }
  const findingError =
    typeof query.bulgu_hata === "string"
      ? (t.expert.findings.errors[query.bulgu_hata] ?? t.expert.findings.errors.write_failed)
      : null;

  return (
    <ReviewView
      ctx={ctx}
      filter={filter}
      selected={selected}
      detail={detail}
      messages={{ error, findingError, saved: query.kayit === "1" }}
    />
  );
}
