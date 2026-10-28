import { kvkkVersionOptions } from "@/lib/operations/kvkk-versions";

// The KVKK notice version ops records (T21): a registered version, or the
// stored free-text value of an older record.
export function KvkkVersionSelect({
  versions,
  defaultValue,
  required,
}: {
  versions: readonly string[];
  defaultValue?: string | null;
  required?: boolean;
}) {
  const options = kvkkVersionOptions(versions, defaultValue);
  return (
    <select
      name="kvkk_text_version"
      defaultValue={defaultValue?.trim() || options[0]}
      required={required}
      data-testid="kvkk-version"
    >
      {options.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}
