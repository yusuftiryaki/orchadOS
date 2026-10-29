import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Facts } from "./facts";
import { FilterTabs } from "./filter-tabs";
import { Kbd } from "./kbd";
import { Pagination, pageOf } from "./pagination";
import { Panel } from "./panel";
import { statusTone } from "./status";

describe("statusTone", () => {
  it("gives a state the same tone in every family", () => {
    // "İncelemede" is info for an application, a payment and a visit alike.
    expect(statusTone("submitted", "application")).toBe("info");
    expect(statusTone("pending_review", "payment")).toBe("info");
    expect(statusTone("in_review", "visit")).toBe("info");
    // Waits on the customer: an open quote, a quoted application.
    expect(statusTone("issued", "quote")).toBe("warning");
    expect(statusTone("quoted", "application")).toBe("warning");
    expect(statusTone("published", "visit")).toBe("success");
    expect(statusTone("failed")).toBe("danger");
    expect(statusTone("cancelled")).toBe("neutral");
  });

  it("knows the codes that mean something else in one family", () => {
    expect(statusTone("completed")).toBe("success");
    expect(statusTone("completed", "order")).toBe("neutral");
    expect(statusTone("completed", "removal")).toBe("neutral");
    expect(statusTone("scheduled", "visit")).toBe("info");
    expect(statusTone("scheduled", "removal")).toBe("warning");
  });

  it("falls back to neutral for an unknown code", () => {
    expect(statusTone("something_new")).toBe("neutral");
  });
});

describe("pageOf", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i);

  it("slices one page and clamps the page number", () => {
    expect(pageOf(rows, "2").rows[0]).toBe(50);
    expect(pageOf(rows, "9").page).toBe(3);
    expect(pageOf(rows, "x").page).toBe(1);
    expect(pageOf(rows, undefined).pages).toBe(3);
  });

  it("renders nothing for a single page and a range otherwise", () => {
    expect(
      renderToStaticMarkup(<Pagination page={1} pages={1} total={3} size={50} href={() => "/"} />),
    ).toBe("");
    const html = renderToStaticMarkup(
      <Pagination page={2} pages={3} total={120} size={50} href={(p) => `/?sayfa=${p}`} />,
    );
    expect(html).toContain("51–100 / 120");
    expect(html).toContain('href="/?sayfa=1"');
    expect(html).toContain('href="/?sayfa=3"');
  });
});

describe("FilterTabs", () => {
  it("marks the current filter with aria-current and shows counts", () => {
    const html = renderToStaticMarkup(
      <FilterTabs
        label="Durum"
        items={[
          { href: "/a", label: "Tümü", count: 12, current: true },
          { href: "/b", label: "İncelemede", count: 3 },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Durum"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain(">12<");
  });
});

describe("Facts", () => {
  it("renders label and value pairs with a placeholder for missing values", () => {
    const html = renderToStaticMarkup(
      <Facts
        rows={[
          ["Paket", "Standart"],
          ["Not", null],
        ]}
        total={["Toplam", "₺100"]}
        variant="summary"
      />,
    );
    expect(html).toContain("<dt>Paket</dt><dd>Standart</dd>");
    expect(html).toContain("<dd>—</dd>");
    expect(html).toContain("<dt>Toplam</dt><dd>₺100</dd>");
  });
});

describe("Panel", () => {
  it("labels the region by its heading", () => {
    const html = renderToStaticMarkup(
      <Panel id="plan" title="Ödeme planı" headingLevel={3}>
        <p>x</p>
      </Panel>,
    );
    expect(html).toContain('aria-labelledby="plan-title"');
    expect(html).toContain('<h3 id="plan-title"');
  });

  it("is a bare surface without a title", () => {
    const html = renderToStaticMarkup(<Panel>içerik</Panel>);
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("aria-labelledby");
  });
});

describe("Kbd", () => {
  it("hides a decorative key from assistive technology", () => {
    expect(renderToStaticMarkup(<Kbd hidden>J</Kbd>)).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<Kbd>J</Kbd>)).not.toContain("aria-hidden");
  });
});
