import { legalText, type LegalDocument } from "@/lib/i18n/messages/legal";
import { blocksHash } from "@/lib/legal/text-hash";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { MESAFELI_V4, ONBILGI_V4 } from "./templates-archive";

// The contract templates by version (docs/musteri-yonetimi.md "Sözleşme
// belgeleri (T04)"): an order's documents are rendered with the versions the
// order accepted, never with whatever legal.ts holds today. The current
// versions come from legal.ts; an earlier version stays renderable from
// ARCHIVED below.
//
// Every version the registry knows a hash of (private.register_legal_text in
// supabase/migrations) must resolve here to blocks with that hash:
// templates.test.ts fails otherwise. So the PR that bumps the pre-information
// or the contract version (also removing "-taslak" at launch) copies the
// outgoing title and blocks into ARCHIVED under the outgoing version. Versions
// the registry has no hash of (before T04, docs/hukuk/arsiv) cannot be
// registered at all; their orders need a manual copy.

export type TemplateKind = "pre_information" | "distance_sales";

export type ContractTemplate = Pick<LegalDocument, "title" | "blocks">;

// Frozen earlier versions: { [version]: { title, blocks } }, copied verbatim
// from legal.ts when the version was replaced (templates-archive.ts).
const ARCHIVED: Record<TemplateKind, Record<string, ContractTemplate>> = {
  pre_information: { "onbilgi-v4-taslak": ONBILGI_V4 },
  distance_sales: { "mesafeli-v4-taslak": MESAFELI_V4 },
};

export function contractTemplate(kind: TemplateKind, version: string): ContractTemplate | null {
  if (version === LEGAL_TEXT_VERSIONS[kind]) {
    return { title: legalText[kind].title, blocks: legalText[kind].blocks };
  }
  return Object.hasOwn(ARCHIVED[kind], version) ? ARCHIVED[kind][version] : null;
}

// The template of the version, only when its hash is the accepted one.
export function acceptedTemplate(
  kind: TemplateKind,
  version: string,
  sha256: string,
): ContractTemplate | null {
  const template = contractTemplate(kind, version);
  return template && blocksHash(template.blocks) === sha256 ? template : null;
}

export function archivedVersions(kind: TemplateKind): string[] {
  return Object.keys(ARCHIVED[kind]);
}
