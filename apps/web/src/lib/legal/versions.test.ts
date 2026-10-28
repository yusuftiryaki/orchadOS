import { describe, expect, it } from "vitest";
import { isDraftVersion, LEGAL_TEXT_VERSIONS } from "./versions";

describe("LEGAL_TEXT_VERSIONS", () => {
  it("matches the design (docs/musteri-yonetimi.md §9, docs/bahce-yonetimi.md §18)", () => {
    expect(LEGAL_TEXT_VERSIONS).toEqual({
      kvkk_notice: "kvkk-v2-taslak",
      explicit_consent: "riza-v2-taslak",
      privacy: "gizlilik-v2-taslak",
      distance_sales: "mesafeli-v3-taslak",
      pre_information: "onbilgi-v3-taslak",
      refund_policy: "iade-v3-taslak",
      field_notice: "bahcede-v1-taslak",
    });
  });

  it("marks drafts by the -taslak suffix", () => {
    expect(isDraftVersion("kvkk-v1-taslak")).toBe(true);
    expect(isDraftVersion("kvkk-v1")).toBe(false);
    expect(isDraftVersion("taslak-v1")).toBe(false);
  });
});
