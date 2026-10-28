import { Table, cell } from "@/components/ui/table";
import { formatDateTime, t } from "@/lib/i18n";
import type { BoundaryPointer } from "@/lib/operations/legal";
import { Panel } from "@/components/ui/panel";

const T = t.legal.pointer;
const C = t.operations.columns;

// T16 (H07): the person who showed the boundary, as the field crew recorded
// it (name and role; never a phone). Staff only: ops parcel page, expert
// inventory view.
export function BoundaryPointers({ pointers }: { pointers: BoundaryPointer[] }) {
  return (
    <Panel title={T.title} description={T.hint} testId="boundary-pointers">
      {pointers.length === 0 ? (
        <p className="muted">{T.none}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{C.name}</th>
              <th>{C.role}</th>
              <th className={cell.num}>{C.date}</th>
            </tr>
          </thead>
          <tbody>
            {pointers.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{T.roles[p.role] ?? p.role}</td>
                <td className={cell.num}>{formatDateTime(p.recordedAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
