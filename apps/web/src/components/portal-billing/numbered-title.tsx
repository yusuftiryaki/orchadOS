import layout from "@/components/portal/page.module.css";

// A title that carries a document number ("Başvuru B-2026-000001"): the
// number never breaks across lines, the words around it may.
export function NumberedTitle({ text, number }: { text: string; number: string | null }) {
  const at = number ? text.indexOf(number) : -1;
  if (!number || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className={layout.nowrap}>{number}</span>
      {text.slice(at + number.length)}
    </>
  );
}
