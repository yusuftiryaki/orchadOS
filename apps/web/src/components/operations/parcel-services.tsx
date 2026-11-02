import Link from "next/link";
import { saveRobotNoteAction } from "@/app/operasyon/hizmet/actions";
import { ActionForm } from "@/components/back-office/action-form";
import { day, money, when } from "@/components/back-office/parts";
import { Field, Notice } from "@/components/operations/field";
import ops from "@/components/operations/operations.module.css";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { statusTone } from "@/components/ui/status";
import { Table, cell } from "@/components/ui/table";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";
import type { RobotNoteRow, parcelServiceRequests } from "@/lib/operations/service-data";
import {
  ROBOT_SLOPES,
  ROBOT_STONINESS,
  readServiceNotice,
  serviceHref,
} from "@/lib/operations/services";

const S = opsServicesText;
const R = S.robot;

type Requests = Awaited<ReturnType<typeof parcelServiceRequests>>;

// The ops parcel page's service layer (IP15): the parcel's service requests
// and the robot suitability note (staff only; never shown to the owner).
export function ParcelServices({
  parcelId,
  requests,
  robotNote,
  params,
}: {
  parcelId: string;
  requests: Requests;
  robotNote: RobotNoteRow | null;
  params: Record<string, string | string[] | undefined>;
}) {
  const saved = readServiceNotice(params) === "robot_note_saved";
  return (
    <>
      <Panel
        plain
        title={S.parcel.title}
        testId="parcel-service-requests"
        actions={
          <ButtonLink variant="secondary" size="sm" href={serviceHref.queue()}>
            {S.parcel.queue}
          </ButtonLink>
        }
      >
        {requests.length === 0 ? (
          <EmptyState compact headingLevel={3} title={S.parcel.empty} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{S.columns.number}</th>
                <th>{S.service}</th>
                <th>{S.columns.status}</th>
                <th className={cell.num}>{S.columns.scheduled}</th>
                <th className={cell.num}>{S.columns.amount}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} data-service-request-id={r.id}>
                  <td className={`${cell.code} ${cell.nowrap}`}>
                    <Link href={serviceHref.request(r.id)}>{r.number}</Link>
                  </td>
                  <td>{r.service_type?.name ?? "—"}</td>
                  <td>
                    <Badge tone={statusTone(r.status)}>{S.status[r.status] ?? r.status}</Badge>
                  </td>
                  <td className={`${cell.num} ${cell.nowrap}`}>
                    {day(r.status === "done" ? r.completed_on : r.scheduled_date)}
                  </td>
                  <td className={`${cell.num} ${cell.nowrap}`}>
                    {money(r.quote_total_kurus ?? r.estimate_total_kurus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel title={R.title} description={R.lead} id="robot" testId="parcel-robot-note">
        {saved && <Notice>{S.notices.robot_note_saved}</Notice>}
        <ActionForm action={saveRobotNoteAction} testId="robot-note-form">
          <input type="hidden" name="parcel_id" value={parcelId} />
          <div className={ops.grid}>
            <Field label={R.slope}>
              <Select id="robot-slope" name="slope" defaultValue={robotNote?.slope ?? ""}>
                <option value="">{R.unknown}</option>
                {ROBOT_SLOPES.map((v) => (
                  <option key={v} value={v}>
                    {R.slopes[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={R.stoniness}>
              <Select
                id="robot-stoniness"
                name="stoniness"
                defaultValue={robotNote?.stoniness ?? ""}
              >
                <option value="">{R.unknown}</option>
                {ROBOT_STONINESS.map((v) => (
                  <option key={v} value={v}>
                    {R.stones[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={R.lowestBranch} optional>
              <input
                id="robot-lowest-branch"
                name="lowest_branch_cm"
                type="number"
                min={0}
                max={500}
                defaultValue={robotNote?.lowest_branch_cm ?? ""}
              />
            </Field>
          </div>
          <Field label={R.note} optional>
            <textarea
              id="robot-note"
              name="note"
              maxLength={1000}
              rows={2}
              defaultValue={robotNote?.note ?? ""}
            />
          </Field>
          {robotNote && <p className={ops.formNote}>{R.updatedAt(when(robotNote.updated_at))}</p>}
          <div className={ops.actions}>
            <Button type="submit" variant="secondary">
              {R.save}
            </Button>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}
