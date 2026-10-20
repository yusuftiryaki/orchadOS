import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/database.types";
import { tr } from "@/lib/i18n/tr";
import { FINDING_KINDS } from "./findings";
import { FILTERS } from "./summary";

// Every value the expert panel shows has a Turkish label.
describe("expert panel messages", () => {
  const enums = Constants.public.Enums;
  it.each([
    ["session_kind", enums.session_kind, tr.expert.kinds],
    ["season", enums.season, tr.expert.seasons],
    ["finding_severity", enums.finding_severity, tr.expert.findings.severities],
  ] as const)("labels every %s value", (_name, values, labels) => {
    for (const value of values) expect(labels[value as keyof typeof labels]).toBeTruthy();
  });

  it("labels every suggested finding kind and filter", () => {
    for (const kind of FINDING_KINDS) expect(tr.expert.findings.kinds[kind]).toBeTruthy();
    for (const filter of FILTERS) expect(tr.expert.review.filters[filter]).toBeTruthy();
  });
});
