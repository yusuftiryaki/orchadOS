import { createHash } from "node:crypto";
import { legalText, type LegalBlock } from "@/lib/i18n/messages/legal";
import { EARLY_PERFORMANCE_TEXT, EARLY_PERFORMANCE_VERSION } from "@/lib/legal/early-performance";
import { LEGAL_TEXT_VERSIONS, type LegalText } from "@/lib/legal/versions";

// Template hashes of the legal texts (docs/musteri-yonetimi.md "Sözleşme
// belgeleri (T04)"): consent_record.text_sha256 and
// private.legal_text_version.sha256.
//
// Canonical serialisation: the text's blocks as in legal.ts (before any
// company or order placeholder is filled), written as JSON with the keys of
// every object sorted by code unit, no whitespace, strings escaped as
// JSON.stringify does (non-ASCII characters stay literal), encoded as UTF-8.
// The hash is the lower-case hex SHA-256 of those bytes. The early-performance
// box is hashed as one paragraph block: [{"kind":"p","text":<box text>}].

export type RegisteredText = LegalText | "early_performance";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("non-finite number");
    if (value === undefined) throw new Error("undefined value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256Hex(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

export function blocksHash(blocks: LegalBlock[]): string {
  return sha256Hex(canonicalJson(blocks));
}

export const EARLY_PERFORMANCE_BLOCKS: LegalBlock[] = [{ kind: "p", text: EARLY_PERFORMANCE_TEXT }];

export function legalTextHash(kind: RegisteredText): string {
  return blocksHash(kind === "early_performance" ? EARLY_PERFORMANCE_BLOCKS : legalText[kind].blocks);
}

// The current version and template hash of every registered kind: what
// private.legal_text_version holds as its current rows.
export function currentLegalTexts(): Record<RegisteredText, { version: string; sha256: string }> {
  const out = {} as Record<RegisteredText, { version: string; sha256: string }>;
  for (const kind of Object.keys(LEGAL_TEXT_VERSIONS) as LegalText[]) {
    out[kind] = { version: LEGAL_TEXT_VERSIONS[kind], sha256: legalTextHash(kind) };
  }
  out.early_performance = {
    version: EARLY_PERFORMANCE_VERSION,
    sha256: legalTextHash("early_performance"),
  };
  return out;
}
