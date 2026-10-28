import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/portal/portal.module.css";
import { TourLoader } from "@/components/portal/tour-loader";
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
    <main className={styles.page}>
      <p>
        <Link href={`/portal/parsel/${parcelId}`}>
          ← {t.portal.tour.back} ({data.parcel.name})
        </Link>
      </p>
      <h1>{t.portal.tour.title}</h1>
      {data.panoramas.length === 0 ? (
        <p className={styles.notice} data-testid="tour-empty">
          {t.portal.tour.empty}
        </p>
      ) : (
        <TourLoader data={data} start={start} images={images} />
      )}
    </main>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
