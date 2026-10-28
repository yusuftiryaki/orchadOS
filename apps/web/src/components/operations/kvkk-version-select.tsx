import { kvkkVersionOptions } from "@/lib/operations/kvkk-versions";

// The KVKK notice version ops records (T21): a registered version, or the
// stored free-text value of an older record. `name` is a prop so that Field
// gives the select its id and label.
export function KvkkVersionSelect({
  versions,
  defaultValue,
  required,
  name = "kvkk_text_version",
  ...rest
}: {
  versions: readonly string[];
  defaultValue?: string | null;
  required?: boolean;
  name?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const options = kvkkVersionOptions(versions, defaultValue);
  return (
    <select
      {...rest}
      name={name}
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
