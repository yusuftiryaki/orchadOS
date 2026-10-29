import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import type { Client } from "@/lib/supabase/types";

// The KVKK notice versions the database knows (registered_legal_text_versions,
// T21), current first: ops records a notice by choosing one. Without the
// function (web deployed first) or on an error: the version of this build.
export async function getKvkkVersions(supabase: Client): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("registered_legal_text_versions");
    const versions = (data ?? [])
      .filter((r) => r.kind === "kvkk_notice")
      .sort((a, b) => Number(b.is_current) - Number(a.is_current))
      .map((r) => r.version);
    if (error || versions.length === 0) return [LEGAL_TEXT_VERSIONS.kvkk_notice];
    return versions;
  } catch {
    return [LEGAL_TEXT_VERSIONS.kvkk_notice];
  }
}

// The options of the select: the registered versions, plus a stored value
// that is not one of them (free text recorded before T21 stays as it is).
export function kvkkVersionOptions(
  registered: readonly string[],
  stored?: string | null,
): string[] {
  const value = stored?.trim();
  return value && !registered.includes(value) ? [...registered, value] : [...registered];
}
