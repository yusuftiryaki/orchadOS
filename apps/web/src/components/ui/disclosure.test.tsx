import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Consequence, Disclosure } from "./disclosure";
import { EmptyState } from "./empty-state";
import { statusTone } from "./status";

describe("Disclosure", () => {
  it("is closed by default, its title is the toggle and the consequence comes first", () => {
    const html = renderToStaticMarkup(
      <Disclosure title="Başvuruyu reddet" testId="reject">
        <Consequence>Başvuru kapanır.</Consequence>
        <button type="submit">Başvuruyu reddet</button>
      </Disclosure>,
    );
    expect(html).toMatch(/^<details[^>]*data-testid="reject"/);
    expect(html).not.toContain(" open");
    expect(html).toMatch(/<summary[^>]*>Başvuruyu reddet<\/summary>/);
    expect(html.indexOf("Başvuru kapanır.")).toBeLessThan(html.indexOf("<button"));
  });

  it("can start open", () => {
    expect(
      renderToStaticMarkup(
        <Disclosure open title="Kaydet">
          x
        </Disclosure>,
      ),
    ).toMatch(/<details[^>]* open=""/);
  });
});

describe("EmptyState compact", () => {
  it("drops the picture and keeps the heading level", () => {
    const html = renderToStaticMarkup(
      <EmptyState compact headingLevel={3} title="Henüz teklif verilmedi" />,
    );
    expect(html).toContain("<h3>Henüz teklif verilmedi</h3>");
    expect(html).not.toContain('aria-hidden="true"');
  });
});

describe("statusTone installments", () => {
  it("reads a paid installment as done and a pending one as not started", () => {
    expect(statusTone("paid", "installment")).toBe("success");
    expect(statusTone("pending", "installment")).toBe("neutral");
    expect(statusTone("cancelled", "installment")).toBe("neutral");
  });
});
