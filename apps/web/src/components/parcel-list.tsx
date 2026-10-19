import Link from "next/link";
import type { Section } from "@/lib/auth/roles";
import { formatNumber, t } from "@/lib/i18n";
import { listParcels } from "@/lib/parcels";
import { createClient } from "@/lib/supabase/server";
import styles from "./parcel-list.module.css";

// Lists every parcel row level security lets the user read. No filtering here.
export async function ParcelList({ section }: { section: Section }) {
  const supabase = await createClient();
  const parcels = await listParcels(supabase);

  return (
    <main className="page">
      <h1>{t.parcels.title}</h1>
      {parcels.length === 0 ? (
        <p className="muted">{t.parcels.empty}</p>
      ) : (
        <table className={styles.table} data-testid="parcel-list">
          <thead>
            <tr>
              <th>{t.parcels.columns.name}</th>
              <th>{t.parcels.columns.location}</th>
              <th className={styles.number}>{t.parcels.columns.area}</th>
              <th className={styles.number}>{t.parcels.columns.trees}</th>
              <th>{t.parcels.columns.status}</th>
            </tr>
          </thead>
          <tbody>
            {parcels.map((parcel) => (
              <tr key={parcel.id} data-parcel-id={parcel.id}>
                <td>
                  <Link href={`/${section}/parsel/${parcel.id}`}>{parcel.name}</Link>
                </td>
                <td>
                  {[parcel.village, parcel.district, parcel.province].filter(Boolean).join(", ")}
                </td>
                <td className={styles.number}>
                  {parcel.estimated_area_m2 != null &&
                    `${formatNumber(parcel.estimated_area_m2)} ${t.parcels.areaUnit}`}
                </td>
                <td className={styles.number}>
                  {parcel.estimated_tree_count != null && formatNumber(parcel.estimated_tree_count)}
                </td>
                <td>{t.parcels.status[parcel.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
