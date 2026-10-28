import { formatDateTime, t } from "@/lib/i18n";
import type { BoundaryPointer } from "@/lib/operations/legal";
import styles from "./operations.module.css";

const T = t.legal.pointer;

// T16 (H07): the person who showed the boundary, as the field crew recorded
// it (name and role; never a phone). Staff only: ops parcel page, expert
// inventory view.
export function BoundaryPointers({ pointers }: { pointers: BoundaryPointer[] }) {
  return (
    <section className={styles.section} data-testid="boundary-pointers">
      <h2>{T.title}</h2>
      <p className="muted">{T.hint}</p>
      {pointers.length === 0 ? (
        <p className="muted">{T.none}</p>
      ) : (
        <ul>
          {pointers.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> · {T.roles[p.role] ?? p.role} ·{" "}
              <span className="muted">{formatDateTime(p.recordedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
