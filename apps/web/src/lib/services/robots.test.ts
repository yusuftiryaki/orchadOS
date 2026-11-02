import { describe, expect, it } from "vitest";
import { defaultRobotOffer, robotModelOf, robotOfferOf } from "./robots";

const ROW = {
  robot_model_id: "91600000-0000-4000-8000-000000000001",
  code: "maraba_i",
  name: "MARABA-I",
  short_description: "orchadOS tarama kitini taşıyan otonom bahçe robotu",
  capabilities: ["Misinalı biçme kafası", "Acil stop ve çarpma tamponu"],
  image_path: "/robots/maraba-dijital-ikiz.jpg",
  is_default: true,
  price_list_version: 2,
  price_per_donum_kurus: 37_500,
  minimum_fee_kurus: 250_000,
  vat_rate_bp: 2000,
  estimate_subtotal_kurus: 735_000,
  estimate_vat_kurus: 147_000,
  estimate_total_kurus: 882_000,
};

describe("robot models", () => {
  it("reads a model with its image and technical drawing", () => {
    expect(
      robotModelOf({
        id: ROW.robot_model_id,
        code: "maraba_i",
        name: "MARABA-I",
        short_description: ROW.short_description,
        capabilities: ROW.capabilities,
        image_path: ROW.image_path,
      }),
    ).toEqual({
      id: ROW.robot_model_id,
      code: "maraba_i",
      name: "MARABA-I",
      shortDescription: ROW.short_description,
      capabilities: ROW.capabilities,
      imagePath: "/robots/maraba-dijital-ikiz.jpg",
      drawingPath: "/robots/maraba-i.svg",
    });
  });

  it("draws only images shipped under /robots/", () => {
    const of = (image_path: string | null) =>
      robotModelOf({ ...ROW, id: "x", code: "other", capabilities: null, image_path }).imagePath;
    expect(of("/robots/x.png")).toBe("/robots/x.png");
    expect(of("/logo.svg")).toBeNull();
    expect(of("/robots/../secret.jpg")).toBeNull();
    expect(of(null)).toBeNull();
    expect(
      robotModelOf({ ...ROW, id: "x", code: "other", capabilities: null }).capabilities,
    ).toEqual([]);
  });

  it("a priced model carries its estimate; an unpriced one none", () => {
    const priced = robotOfferOf(ROW);
    expect(priced.isDefault).toBe(true);
    expect(priced.robot.name).toBe("MARABA-I");
    expect(priced.estimate).toEqual({
      version: 2,
      perDonum: 37_500,
      minimumFee: 250_000,
      vatRateBp: 2000,
      subtotal: 735_000,
      vat: 147_000,
      total: 882_000,
    });
    const unpriced = robotOfferOf({
      ...ROW,
      price_list_version: null,
      price_per_donum_kurus: null,
      minimum_fee_kurus: null,
      vat_rate_bp: null,
      estimate_subtotal_kurus: null,
      estimate_vat_kurus: null,
      estimate_total_kurus: null,
    } as unknown as typeof ROW);
    expect(unpriced.estimate).toBeNull();
  });

  it("preselects the default model, else the first", () => {
    const a = robotOfferOf({ ...ROW, robot_model_id: "a", is_default: false });
    const b = robotOfferOf({ ...ROW, robot_model_id: "b", is_default: true });
    expect(defaultRobotOffer([a, b])?.robot.id).toBe("b");
    expect(defaultRobotOffer([a])?.robot.id).toBe("a");
    expect(defaultRobotOffer([])).toBeNull();
  });
});
