import { canonicalJson, legalTextHash, sha256Hex } from "@/lib/legal/text-hash";
import type { FilledDocument } from "./render";
import type { AcceptedText } from "./snapshot";

// display_sha256 (docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)"): the
// SHA-256 of the filled rendering the customer saw on the quote page.
//
// Canonical serialisation: the FilledDocument the page renders (render.ts),
// that is {blocks, draft, kind, orderNumber, title, version}, written with the
// template hash's canonical JSON (text-hash.ts: keys sorted by code unit, no
// whitespace, JSON.stringify escaping, UTF-8); the hash is the lower-case hex
// SHA-256 of those bytes. The page renders nothing of the documents beyond
// these fields: title, version, the draft mark and the blocks in order.
export function displaySha256(doc: FilledDocument): string {
  return sha256Hex(
    canonicalJson({
      blocks: doc.blocks,
      draft: doc.draft,
      kind: doc.kind,
      orderNumber: doc.orderNumber,
      title: doc.title,
      version: doc.version,
    }),
  );
}

export interface ConsentEntry {
  version: string;
  sha256: string;
  display_sha256?: string;
}

// The object form of customer_accept_quote's p_consents (§20.2): the version
// shown, its registered template hash and the hash of the filled rendering.
// The early-performance box is its template; it has no filled rendering.
// The texts the acceptance records: the acceptance snapshot keeps them.
export function acceptedTexts(
  pre: FilledDocument,
  contract: FilledDocument,
): { pre_information: AcceptedText; distance_sales: AcceptedText } {
  return {
    pre_information: {
      version: pre.version,
      sha256: legalTextHash("pre_information"),
      display_sha256: displaySha256(pre),
    },
    distance_sales: {
      version: contract.version,
      sha256: legalTextHash("distance_sales"),
      display_sha256: displaySha256(contract),
    },
  };
}

export function acceptanceConsents(
  pre: FilledDocument,
  contract: FilledDocument,
  earlyPerformance: { version: string } | null,
): Record<string, ConsentEntry> {
  return {
    ...acceptedTexts(pre, contract),
    ...(earlyPerformance
      ? {
          early_performance: {
            version: earlyPerformance.version,
            sha256: legalTextHash("early_performance"),
          },
        }
      : {}),
  };
}
