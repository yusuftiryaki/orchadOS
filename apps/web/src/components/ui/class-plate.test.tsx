import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClassPlate, plateDots } from "./class-plate";

const sum = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + b, 0);

describe("plateDots", () => {
  it("rounds shares to exactly 100 dots", () => {
    const d = plateDots({ healthy: 232, attention: 40, problem: 16, dead: 13, unassessed: 1 });
    expect(sum(d)).toBe(100);
    expect(d.healthy).toBeGreaterThan(70);
  });

  it("keeps at least one dot for a class with any trees", () => {
    const d = plateDots({ healthy: 999, unassessed: 1 });
    expect(d.unassessed).toBe(1);
    expect(d.healthy).toBe(99);
  });

  it("is deterministic on ties (class order wins)", () => {
    expect(plateDots({ healthy: 1, attention: 1, problem: 1 })).toEqual(
      plateDots({ healthy: 1, attention: 1, problem: 1 }),
    );
    const d = plateDots({ healthy: 1, attention: 1, problem: 1 });
    expect([d.healthy, d.attention, d.problem]).toEqual([34, 33, 33]);
  });

  it("gives an empty garden no dots", () => {
    expect(sum(plateDots({}))).toBe(0);
  });
});

describe("ClassPlate", () => {
  it("is decoration with 100 tree dots in class order", () => {
    const html = renderToStaticMarkup(<ClassPlate counts={{ healthy: 3, problem: 1 }} />);
    expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
    const classes = [...html.matchAll(/data-class="(\w+)"/g)].map((m) => m[1]);
    expect(classes).toHaveLength(100);
    expect(classes[0]).toBe("healthy");
    expect(classes.at(-1)).toBe("problem");
  });

  it("draws empty planting rows when no tree is assessed", () => {
    const html = renderToStaticMarkup(<ClassPlate counts={{}} testId="plate" />);
    expect(html).toContain('data-empty="true"');
    expect(html).not.toContain("data-class=");
  });
});
