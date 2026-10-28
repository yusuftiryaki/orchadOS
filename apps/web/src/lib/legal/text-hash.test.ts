import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legalText } from "@/lib/i18n/messages/legal";
import { EARLY_PERFORMANCE_TEXT, EARLY_PERFORMANCE_VERSION } from "./early-performance";
import { blocksFromMarkdown } from "./from-markdown";
import {
  blocksHash,
  canonicalJson,
  currentLegalTexts,
  legalTextHash,
  sha256Hex,
  type RegisteredText,
} from "./text-hash";
import { LEGAL_TEXT_VERSIONS, type LegalText } from "./versions";

const repo = (path: string) => new URL(`../../../../../${path}`, import.meta.url);
const ALL = Object.keys(LEGAL_TEXT_VERSIONS) as LegalText[];

// The registry (supabase/migrations/20261103100100_legal_text_registry.sql)
// holds these hashes; a text change or a version bump needs a new registry
// migration, and then this record changes with it (the integration test
// legal-registry.test.ts compares the database too).
const CURRENT: Record<RegisteredText, { version: string; sha256: string }> = {
  kvkk_notice: {
    version: "kvkk-v2-taslak",
    sha256: "b4a873a3d57f02958f0b73662828a13aa0a5fb98c85aa8ffcf75161636f76052",
  },
  explicit_consent: {
    version: "riza-v2-taslak",
    sha256: "959cc1375322156a375619da78468d51dd6fa0dd165e5b13f1a3ce6f693234c8",
  },
  privacy: {
    version: "gizlilik-v2-taslak",
    sha256: "94c793947e1ab06819958b19dee39962be914a2821892e0cb13866c311770ad9",
  },
  distance_sales: {
    version: "mesafeli-v3-taslak",
    sha256: "47bf481aa03349cd8b8501e3327ada8d412553a61f86aac49ab774170145eb61",
  },
  pre_information: {
    version: "onbilgi-v3-taslak",
    sha256: "f83ec40328fa5cbfa9fa263bca9883bdeed0d832c2488d2ab44e0439982ff08e",
  },
  refund_policy: {
    version: "iade-v3-taslak",
    sha256: "d477e226429491cf2ffe7c558bb0d75ff9d11d5e94db9c8d61987533a789a3ec",
  },
  field_notice: {
    version: "bahcede-v1-taslak",
    sha256: "e993ff6d5a947596108d3246f678b040159f6bd81bb9cb2d11755a1234255a47",
  },
  early_performance: {
    version: "mesafeli-v3-taslak",
    sha256: "3745a7686d1205ffcd0af3081d3891b345a297c6fdfbdbf37c7028c09b1c5bb2",
  },
};

// File SHA-256 of every archived draft (docs/hukuk/arsiv/): an archived
// version never changes (the "arşiv ile sürüm eşleşmesi" of T04).
const ARCHIVE: Record<string, string> = {
  "acik-riza-metni-v1.md": "36d5de83fdd51518ea4f3322bffb9df2505b268c1d645355f67d825f3da46549",
  "gizlilik-cerez-politikasi-taslagi-v1.md":
    "f826bcc20e57c3a1180f3da6eb44b33c6487879459ad7fe1eda293a0f0814d6b",
  "hizmet-sozlesmesi-taslagi-v1.md":
    "69258a04bd08303dea2c2296c21b363efa66380fc9186206c86108b6e04fb158",
  "hizmet-sozlesmesi-taslagi-v2.md":
    "6164a2d7a156a343bb0c390831282518758d62e824e47a582df9dc973f1fe0e1",
  "iptal-iade-politikasi-taslagi-v1.md":
    "0a583ba857faa07857372efa68b7cacc2460707b2d530562c786f6cb5497eac9",
  "iptal-iade-politikasi-taslagi-v2.md":
    "11451b66e8f72f83269625cd53a0d61acd6ac3fcb3b3154f76ddbc6dbf0a48d7",
  "kvkk-aydinlatma-metni-v1.md": "53d8c352b0de6e7628d634ae702cb884595e30ffb18d88c444d800e4755c0c55",
  "on-bilgilendirme-formu-taslagi-v1.md":
    "6c6d8170b98d0f85109728b61db9dcabe13e4b2ed8328b884a19b8981917d852",
  "on-bilgilendirme-formu-taslagi-v2.md":
    "daa86c3f6332c8d6faadfa8710471c3cad086af921be0cabe61e6c049206d998",
};

describe("canonical serialisation", () => {
  it("sorts keys, drops whitespace and keeps Turkish letters", () => {
    expect(canonicalJson({ text: "Ağaç", kind: "p" })).toBe('{"kind":"p","text":"Ağaç"}');
    expect(canonicalJson([{ b: 1, a: [true, null] }])).toBe('[{"a":[true,null],"b":1}]');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });

  it("hashes UTF-8 bytes (known vector)", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(blocksHash([{ kind: "p", text: "x" }])).toBe(sha256Hex('[{"kind":"p","text":"x"}]'));
  });
});

describe("template hashes", () => {
  it("are stable and equal the registry record", () => {
    expect(currentLegalTexts()).toEqual(CURRENT);
    expect(currentLegalTexts()).toEqual(currentLegalTexts());
  });

  it.each(ALL)("hash %s as derived from its draft in docs/hukuk", (key) => {
    const draft = readFileSync(repo(legalText[key].source), "utf8");
    expect(blocksHash(blocksFromMarkdown(draft))).toBe(legalTextHash(key));
  });

  it("hash the early-performance box with the contract's version", () => {
    expect(EARLY_PERFORMANCE_VERSION).toBe(LEGAL_TEXT_VERSIONS.distance_sales);
    expect(legalTextHash("early_performance")).toBe(
      blocksHash([{ kind: "p", text: EARLY_PERFORMANCE_TEXT }]),
    );
    expect(EARLY_PERFORMANCE_TEXT).toMatch(/^Hizmete \(envanter ve periyodik ziyaretler\) 14 günlük/);
  });
});

describe("archive", () => {
  it("pins every archived draft by its file hash", () => {
    const files = readdirSync(repo("docs/hukuk/arsiv")).filter((f) => f.endsWith(".md")).sort();
    expect(files).toEqual(Object.keys(ARCHIVE).sort());
    for (const file of files) {
      expect(sha256Hex(readFileSync(repo(`docs/hukuk/arsiv/${file}`))), file).toBe(ARCHIVE[file]);
    }
  });
});
