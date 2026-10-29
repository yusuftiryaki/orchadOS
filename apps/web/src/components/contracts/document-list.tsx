import type { ContractDocumentRow } from "@/lib/contracts/generate";
import { formatDateTime } from "@/lib/i18n";
import { contractsText as C, type ContractDocumentKind } from "@/lib/i18n/messages/contracts";
import { Table, cell } from "@/components/ui/table";
import styles from "./contracts.module.css";

const kindLabel = (kind: string) => C.kind[kind as ContractDocumentKind] ?? kind;

// The stored contract documents of one order, with their versions, hashes
// and download links (Sözleşmelerim, the customer's order page, the ops
// order page).
export function ContractDocumentTable({
  documents,
  hrefOf,
  showGenerator = false,
}: {
  documents: ContractDocumentRow[];
  hrefOf: (doc: ContractDocumentRow) => string;
  showGenerator?: boolean;
}) {
  return (
    <Table data-testid="contract-documents">
      <thead>
        <tr>
          <th>{C.list.kind}</th>
          <th>{C.list.version}</th>
          <th>{C.list.created}</th>
          <th className={cell.num}>{C.list.size}</th>
          <th>{C.list.sha}</th>
          {showGenerator && <th>{C.ops.generator}</th>}
          <th>
            <span className="sr-only">{C.list.download}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {documents.map((d) => (
          <tr key={d.id} data-kind={d.kind}>
            <td>{kindLabel(d.kind)}</td>
            <td>{d.text_version}</td>
            <td className={cell.nowrap}>{formatDateTime(d.created_at)}</td>
            <td className={cell.num}>{C.list.kb(d.size_bytes)}</td>
            <td className={styles.hash}>{d.sha256}</td>
            {showGenerator && <td>{d.generator}</td>}
            <td>
              <a href={hrefOf(d)} download data-testid="contract-download">
                {C.list.download}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
