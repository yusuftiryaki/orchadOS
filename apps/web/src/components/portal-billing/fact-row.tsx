import type { ReactNode } from "react";
import { factsClass } from "@/components/ui/facts";

// One row of a Facts list (<dl className={factsClass.list | summary}>) whose
// value carries a test id or which is conditional; `total` is the row under
// the rule ("Toplam (KDV dahil)").
export function FactRow({
  label,
  testId,
  total = false,
  children,
}: {
  label: ReactNode;
  testId?: string;
  total?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={total ? factsClass.total : factsClass.fact}>
      <dt>{label}</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  );
}
