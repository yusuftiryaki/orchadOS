import Link from "next/link";
import { notFound } from "next/navigation";
import { OfficeToolLoader } from "@/components/office/office-tool-loader";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import { loadInventoryContext } from "@/lib/office/inventory";
import { panoramaSource } from "@/lib/office/panorama-source";
import { createClient } from "@/lib/supabase/server";
import styles from "@/components/office/office-tool.module.css";

// Office triangulation tool for one parcel. Without ?oturum=&set= it first
// asks for the inventory session and the processed panorama set.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ parcelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("ofis");
  const { parcelId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const ctx = await loadInventoryContext(supabase, parcelId);
  if (!ctx) notFound();

  const source = panoramaSource();
  const sets = source ? await source.listSets() : [];
  const session = ctx.sessions.find((s) => s.id === query.oturum);
  const set = sets.find((s) => s.id === query.set);
  const panoramas = source && set ? await source.listPanoramas(set.id) : null;

  const header = (
    <>
      <p>
        <Link href={`/ofis/parsel/${parcelId}`}>← {t.office.back}</Link>
      </p>
      <h1>
        {t.office.title} · {ctx.parcel.name}
      </h1>
    </>
  );

  if (!session || !set || !panoramas) {
    const defaultSession = session ?? ctx.sessions[0];
    const defaultSet =
      set ?? sets.find((s) => s.sessionId === defaultSession?.id) ?? sets[0] ?? null;
    return (
      <main className="page">
        {header}
        <form method="get" className={styles.chooser} data-testid="office-chooser">
          <h2>{t.office.chooseTitle}</h2>
          <p className="muted">{t.office.chooseHint}</p>
          {ctx.sessions.length === 0 ? (
            <p role="alert">{t.office.noSessions}</p>
          ) : (
            <label className={styles.field}>
              {t.office.session}
              <select name="oturum" defaultValue={defaultSession?.id}>
                {ctx.sessions.map((s) => {
                  const date = s.startedAt ?? s.plannedDate;
                  return (
                    <option key={s.id} value={s.id}>
                      {t.office.sessionLabel(
                        date ? formatDate(date) : s.id.slice(0, 8),
                        t.office.sessionStatus[s.status],
                      )}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          {!source ? (
            <p role="alert">{t.office.noSource}</p>
          ) : sets.length === 0 ? (
            <p role="alert">{t.office.noSets}</p>
          ) : (
            <label className={styles.field}>
              {t.office.panoramaSet}
              <select name="set" defaultValue={defaultSet?.id}>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t.office.setLabel(s.label, s.count)}
                    {" · "}
                    {ctx.sessions.some((x) => x.id === s.sessionId)
                      ? t.office.setMatches
                      : t.office.setMismatch(s.sessionId)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="button"
            type="submit"
            disabled={!source || sets.length === 0 || ctx.sessions.length === 0}
          >
            {t.office.open}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {header}
      <OfficeToolLoader
        key={`${session.id}:${set.id}`}
        parcelId={ctx.parcel.id}
        sessionId={session.id}
        set={set}
        panoramas={panoramas}
        geometry={ctx.geometry}
        recordedNumbering={ctx.parcel.numbering}
        canSetNumbering={user.roles.orgRoles.includes("ops")}
        existing={ctx.existing}
      />
    </main>
  );
}
