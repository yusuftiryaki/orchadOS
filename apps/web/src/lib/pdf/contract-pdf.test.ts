import { describe, expect, it } from "vitest";
import { activeInput, addonInput, initialInput, renewalInput } from "@/lib/contracts/fixtures";
import { contractDocument } from "@/lib/contracts/render";
import { contractPdf, inlineRuns } from "./contract-pdf";

const AT = new Date("2027-03-01T08:00:00Z");
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("contract PDFs (T04)", () => {
  it.each([
    ["initial", initialInput()],
    ["add-on", addonInput()],
    ["renewal", renewalInput()],
  ])(
    "renders the %s quote's pre-information and contract, deterministically",
    async (_, input) => {
      for (const kind of ["pre_information", "distance_sales"] as const) {
        const doc = contractDocument(kind, input);
        const a = await contractPdf(doc, AT);
        const b = await contractPdf(doc, AT);
        expect(a.subarray(0, 5).toString()).toBe("%PDF-");
        expect(a.equals(b)).toBe(true);
        expect(pages(a)).toBeGreaterThan(kind === "distance_sales" ? 5 : 2);
      }
    },
    60_000,
  );

  it("renders the withdrawal confirmation on one page", async () => {
    const pdf = await contractPdf(contractDocument("withdrawal_confirmation", activeInput()), AT);
    expect(pages(pdf)).toBe(1);
  }, 30_000);

  it("changes with the order data", async () => {
    const a = await contractPdf(contractDocument("distance_sales", initialInput()), AT);
    const b = await contractPdf(contractDocument("distance_sales", activeInput()), AT);
    expect(a.equals(b)).toBe(false);
  }, 60_000);

  it("prints bold runs and link labels", () => {
    expect(inlineRuns("**Sipariş no:** S-1, bkz. [İade](/iade).")).toEqual([
      { text: "Sipariş no:", bold: true },
      { text: " S-1, bkz. ", bold: false },
      { text: "İade", bold: false },
      { text: ".", bold: false },
    ]);
  });
});
