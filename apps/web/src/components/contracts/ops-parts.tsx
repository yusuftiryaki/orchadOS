import { contractsText as C } from "@/lib/i18n/messages/contracts";
import ops from "@/components/operations/operations.module.css";

// The outcome of "Belgeleri üret" (?belgeler=<created>-<failed>).
export function GenerateResult({ value }: { value: string | string[] | undefined }) {
  const match = typeof value === "string" ? /^(\d+)-(\d+)$/.exec(value) : null;
  if (!match) return null;
  const created = Number(match[1]);
  const failed = Number(match[2]);
  const R = C.ops.result;
  const text =
    failed === 0
      ? created === 0
        ? R.none
        : R.generated(created)
      : created === 0
        ? R.failed
        : R.partial(created, failed);
  return (
    <p className={ops.notice} role="status" data-testid="contracts-generate-result">
      {text}
    </p>
  );
}
