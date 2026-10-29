import { notFound } from "next/navigation";
import layout from "@/components/portal/page.module.css";
import { TourLoader } from "@/components/portal/tour-loader";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { getTour } from "@/lib/portal/data";
import { idsToSign, tourNeighbours, tourStart } from "@/lib/portal/tour-view";
import { signTourImages } from "@/lib/portal/tour-sign";
import { createClient } from "@/lib/supabase/server";

// ?panorama=<asset id> opens that panorama; ?agac=<tree id> opens the
// panorama nearest to the tree and turns towards it. The first panorama's
// images (and its neighbours' previews) are signed here, so the viewer starts
// loading without a round trip.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ parcelId: string }>;
  searchParams: Promise<{ panorama?: string | string[]; agac?: string | string[] }>;
}) {
  const user = await requireSection("portal");
  const [{ parcelId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const data = await getTour(supabase, parcelId);
  if (!data) notFound();

  const treeId = first(query.agac);
  const tree = treeId ? data.trees.find((tr) => tr.id === treeId) : undefined;
  const start = { panoramaId: first(query.panorama) ?? null, lookAt: tree?.position ?? null };
  const point = tourStart(data.visits, start);
  const images = point
    ? await signTourImages(
        supabase,
        user,
        data.parcel.id,
        idsToSign(
          point.panorama,
          tourNeighbours(data.visits[point.visitIndex].panoramas, point.panorama).map(
            (n) => n.panorama,
          ),
          {},
        ),
      )
    : null;

  return (
    <main className={layout.page}>
      <PageHeader
        title={t.portal.tour.title}
        back={{ href: `/portal/parsel/${parcelId}`, label: data.parcel.name }}
      />
      {data.panoramas.length === 0 ? (
        <EmptyState title={t.portal.tour.empty} testId="tour-empty">
          <p>{t.portal.tour.emptyBody}</p>
        </EmptyState>
      ) : (
        <TourLoader data={data} start={start} images={images} />
      )}
    </main>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
