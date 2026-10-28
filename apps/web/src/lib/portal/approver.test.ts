import { describe, expect, it } from "vitest";
import { approverLine, parseApprover } from "./approver";

describe("approving expert (T23, H05)", () => {
  it("reads the database's answer", () => {
    expect(parseApprover({ name: " Örnek Uzman ", title: "Ziraat Mühendisi" })).toEqual({
      name: "Örnek Uzman",
      title: "Ziraat Mühendisi",
    });
    expect(parseApprover({ name: "Ad Soyad", title: null })).toEqual({
      name: "Ad Soyad",
      title: null,
    });
    expect(parseApprover(null)).toBeNull();
    expect(parseApprover({ name: "" })).toBeNull();
  });

  it("writes the line the report shows", () => {
    expect(approverLine({ name: "Örnek Uzman", title: "Ziraat Mühendisi" })).toBe(
      "Onaylayan uzman: Örnek Uzman, Ziraat Mühendisi",
    );
    expect(approverLine({ name: "Ad Soyad", title: null })).toBe("Onaylayan uzman: Ad Soyad");
  });
});
