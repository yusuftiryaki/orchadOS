import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { legalText } from "@/lib/i18n/messages/legal";
import { blocksHash, legalTextHash } from "@/lib/legal/text-hash";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { initialInput } from "./fixtures";
import { preInformationDocument, TemplateUnavailableError } from "./render";
import { acceptedTemplate, contractTemplate, type TemplateKind } from "./templates";

// Every version of the pre-information and the contract that the registry
// knows a hash of stays renderable with that hash (an order accepted under it
// gets its documents later too: a retry, the withdrawal confirmation after
// the payment). A version bump that does not archive the outgoing template
// fails here.

const MIGRATIONS = path.resolve(__dirname, "../../../../../supabase/migrations");
const REGISTER =
  /register_legal_text\(\s*'(pre_information|distance_sales)',\s*'([^']+)',\s*'([0-9a-f]{64})'\s*\)/g;

function registeredVersions(): { kind: TemplateKind; version: string; sha256: string }[] {
  const out: { kind: TemplateKind; version: string; sha256: string }[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
    for (const m of sql.matchAll(REGISTER)) {
      out.push({ kind: m[1] as TemplateKind, version: m[2], sha256: m[3] });
    }
  }
  return out;
}

describe("contract templates by version", () => {
  it("resolve every registered version with its registered hash", () => {
    const registered = registeredVersions();
    expect(registered.length).toBeGreaterThanOrEqual(2);
    for (const r of registered) {
      const template = contractTemplate(r.kind, r.version);
      expect(template, `${r.kind} ${r.version}`).not.toBeNull();
      expect(blocksHash(template!.blocks), `${r.kind} ${r.version}`).toBe(r.sha256);
    }
  });

  it("resolve the current versions to legal.ts", () => {
    for (const kind of ["pre_information", "distance_sales"] as const) {
      const template = contractTemplate(kind, LEGAL_TEXT_VERSIONS[kind]);
      expect(template?.blocks).toBe(legalText[kind].blocks);
      expect(acceptedTemplate(kind, LEGAL_TEXT_VERSIONS[kind], legalTextHash(kind))).not.toBeNull();
    }
  });

  it("refuse an unknown version or another hash", () => {
    expect(contractTemplate("pre_information", "onbilgi-v9")).toBeNull();
    expect(contractTemplate("pre_information", "toString")).toBeNull();
    expect(
      acceptedTemplate("pre_information", LEGAL_TEXT_VERSIONS.pre_information, "0".repeat(64)),
    ).toBeNull();
  });

  it("never render a version without its template", () => {
    const input = initialInput({
      versions: { pre_information: "onbilgi-v9", distance_sales: "mesafeli-v9" },
    });
    expect(() => preInformationDocument(input)).toThrow(TemplateUnavailableError);
  });
});
