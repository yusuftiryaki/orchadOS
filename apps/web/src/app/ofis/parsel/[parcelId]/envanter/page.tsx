import { notFound } from "next/navigation";
import { OfficeToolLoader } from "@/components/office/office-tool-loader";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import { loadInventoryContext } from "@/lib/office/inventory";
import { officePanoramaSources } from "@/lib/office/panorama-source";
import { sourceOfSet, type PanoramaSetInfo } from "@/lib/office/panoramas";
import { UUID_RE } from "@/lib/supabase/query";
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
  const [{ parcelId }, query] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(parcelId)) notFound();
  const supabase = await createClient();
  const sources = officePanoramaSources(supabase, user.id);
  // The sets are listed by the parcel id of the URL; they are only used when
  // the parcel exists (ctx).
  const [ctx, setLists] = await Promise.all([
    loadInventoryContext(supabase, parcelId),
    Promise.all(sources.map((s) => s.listSets(parcelId))),
  ]);
  if (!ctx) notFound();

  const sets = setLists.flat();
  const session = ctx.sessions.find((s) => s.id === query.oturum);
  const set = sets.find((s) => s.id === query.set);
  const panoramas = set ? await sourceOfSet(sources, set.id)!.listPanoramas(set.id) : null;
  const back = { href: `/ofis/parsel/${parcelId}`, label: ctx.parcel.name };

  if (!session || !set || !panoramas) {
    const defaultSession = session ?? ctx.sessions[0];
    const defaultSet =
      set ?? sets.find((s) => s.sessionId === defaultSession?.id) ?? sets[0] ?? null;
    const bySource = (["storage", "local"] as const)
      .map((source) => [source, sets.filter((s) => s.source === source)] as const)
      .filter(([, list]) => list.length > 0);
    const optionLabel = (s: PanoramaSetInfo) =>
      ctx.sessions.some((x) => x.id === s.sessionId)
        ? t.office.setLabel(s.label, s.count)
        : `${t.office.setLabel(s.label, s.count)} (${t.office.setMismatch})`;
    return (
      <main className="page">
        <PageHeader back={back} title={t.office.title} />
        <form method="get" className={styles.chooser} data-testid="office-chooser">
          <h2>{t.office.chooseTitle}</h2>
          <p className="muted">{t.office.chooseHint}</p>
          {ctx.sessions.length === 0 ? (
            <Alert tone="warning">{t.office.noSessions}</Alert>
          ) : (
            <Field id="office-session" label={t.office.session}>
              <Select name="oturum" defaultValue={defaultSession?.id}>
                {ctx.sessions.map((s) => {
                  const date = s.startedAt ?? s.plannedDate;
                  return (
                    <option key={s.id} value={s.id}>
                      {(s.kind === "inventory" ? t.office.sessionLabel : t.office.scanSessionLabel)(
                        date ? formatDate(date) : s.id.slice(0, 8),
                        t.office.sessionStatus[s.status],
                      )}
                    </option>
                  );
                })}
              </Select>
            </Field>
          )}
          {sets.length === 0 ? (
            <Alert tone="warning">{t.office.noSets}</Alert>
          ) : (
            <Field id="office-set" label={t.office.panoramaSet} hint={t.office.setHint}>
              <Select name="set" defaultValue={defaultSet?.id}>
                {bySource.map(([source, list]) => (
                  <optgroup key={source} label={t.office.setSource[source]}>
                    {list.map((s) => (
                      <option key={s.id} value={s.id}>
                        {optionLabel(s)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          )}
          <div>
            <Button type="submit" disabled={sets.length === 0 || ctx.sessions.length === 0}>
              {t.office.open}
            </Button>
          </div>
        </form>
      </main>
    );
  }

  const date = session.startedAt ?? session.plannedDate;
  return (
    <main className={styles.page}>
      <PageHeader
        back={back}
        title={t.office.title}
        meta={
          <>
            <span>
              {(session.kind === "inventory" ? t.office.sessionLabel : t.office.scanSessionLabel)(
                date ? formatDate(date) : session.id.slice(0, 8),
                t.office.sessionStatus[session.status],
              )}
            </span>
            <Badge>{t.office.setLabel(set.label, set.count)}</Badge>
          </>
        }
      />
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
