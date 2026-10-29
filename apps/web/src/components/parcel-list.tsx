import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { statusTone } from "@/components/ui/status";
import { cell, Table } from "@/components/ui/table";
import type { Section } from "@/lib/auth/roles";
import { formatNumber, t } from "@/lib/i18n";
import { listParcels } from "@/lib/parcels";
import { createClient } from "@/lib/supabase/server";
import styles from "./parcel-list.module.css";
import staff from "@/components/staff-page.module.css";

// Lists every parcel row level security lets the user read. No filtering here.
export async function ParcelList({ section }: { section: Section }) {
  const supabase = await createClient();
  const parcels = await listParcels(supabase);

  return (
    <main className={`page ${staff.page}`}>
      <PageHeader
        title={t.parcels.title}
        lead={parcels.length > 0 ? t.parcels.lead(parcels.length) : undefined}
      />
      {parcels.length === 0 ? (
        <EmptyState title={t.parcels.empty}>{t.parcels.emptyHint}</EmptyState>
      ) : (
        <Table data-testid="parcel-list" className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t.parcels.columns.name}</th>
              <th scope="col">{t.parcels.columns.location}</th>
              <th scope="col" className={cell.num}>
                {t.parcels.columns.area}
              </th>
              <th scope="col" className={cell.num}>
                {t.parcels.columns.trees}
              </th>
              <th scope="col">{t.parcels.columns.status}</th>
            </tr>
          </thead>
          <tbody>
            {parcels.map((parcel) => (
              <tr key={parcel.id} data-parcel-id={parcel.id}>
                <td className={styles.name}>
                  <Link href={`/${section}/parsel/${parcel.id}`}>{parcel.name}</Link>
                </td>
                <td className={styles.location}>
                  {[parcel.village, parcel.district, parcel.province].filter(Boolean).join(", ")}
                </td>
                <td className={cell.num}>
                  {parcel.estimated_area_m2 != null &&
                    `${formatNumber(parcel.estimated_area_m2)} ${t.parcels.areaUnit}`}
                </td>
                <td className={cell.num}>
                  {parcel.estimated_tree_count != null && formatNumber(parcel.estimated_tree_count)}
                </td>
                <td>
                  <Badge tone={statusTone(parcel.status, "parcel")}>
                    {t.parcels.status[parcel.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </main>
  );
}
