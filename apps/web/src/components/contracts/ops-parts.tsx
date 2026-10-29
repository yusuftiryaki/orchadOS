import { contractsText as C } from "@/lib/i18n/messages/contracts";
import { Alert } from "@/components/ui/alert";

// The outcome of "Belgeleri üret" (?belgeler=<created>-<failed>-<manual>).
export function GenerateResult({ value }: { value: string | string[] | undefined }) {
  const match = typeof value === "string" ? /^(\d+)-(\d+)(?:-(\d+))?$/.exec(value) : null;
  if (!match) return null;
  const created = Number(match[1]);
  const failed = Number(match[2]);
  const manual = Number(match[3] ?? 0);
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
    <Alert
      tone={failed === 0 ? "success" : "warning"}
      role="status"
      testId="contracts-generate-result"
    >
      <p>
        {text}
        {manual > 0 && ` ${R.manual(manual)}`}
      </p>
    </Alert>
  );
}
