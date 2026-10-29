import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Alert } from "./alert";
import { Badge, ClassBadge } from "./badge";
import { Button, buttonClass } from "./button";
import { EmptyState } from "./empty-state";
import { Checkbox, Field, Input } from "./field";
import { PageHeader } from "./page-header";

describe("buttonClass", () => {
  it("keeps a primary, medium button as the plain global class", () => {
    expect(buttonClass()).toBe("button");
    expect(buttonClass({ variant: "secondary" })).toBe("button button-secondary");
    expect(buttonClass({ variant: "danger", size: "sm", block: true })).toBe(
      "button button-danger button-sm button-block",
    );
  });

  it("renders a type=button by default so it never submits a form by accident", () => {
    expect(renderToStaticMarkup(<Button>Kaydet</Button>)).toContain('type="button"');
  });
});

describe("Field", () => {
  it("ties the label, hint and error to the control", () => {
    const html = renderToStaticMarkup(
      <Field id="phone" label="Cep telefonu" hint="05xx xxx xx xx" error="Bu alan gerekli.">
        <Input name="phone" />
      </Field>,
    );
    expect(html).toContain('for="phone"');
    expect(html).toContain('id="phone"');
    expect(html).toContain('aria-describedby="phone-hint phone-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="phone-error"');
  });

  it("leaves aria-invalid off without an error", () => {
    const html = renderToStaticMarkup(
      <Field id="name" label="Ad soyad">
        <Input name="name" />
      </Field>,
    );
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-describedby");
  });

  it("puts a checkbox's label beside it", () => {
    const html = renderToStaticMarkup(<Checkbox id="kvkk" name="kvkk" label="Okudum" />);
    expect(html).toMatch(/<input type="checkbox" id="kvkk"[^>]*>.*<label for="kvkk"/);
  });
});

describe("status and messages", () => {
  it("names the tree class in text next to the colour", () => {
    const html = renderToStaticMarkup(<ClassBadge value="attention">Dikkat</ClassBadge>);
    expect(html).toContain("Dikkat");
    expect(html).toContain('data-class="attention"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders badges, alerts, empty states and page headers with their text", () => {
    expect(renderToStaticMarkup(<Badge tone="success">Ödendi</Badge>)).toContain("Ödendi");
    const alert = renderToStaticMarkup(
      <Alert tone="danger" role="alert" title="Ödeme alınamadı">
        Kartınızı kontrol edip yeniden deneyin.
      </Alert>,
    );
    expect(alert).toContain('role="alert"');
    expect(alert).toContain("Ödeme alınamadı");
    const empty = renderToStaticMarkup(
      <EmptyState title="Henüz bahçeniz yok" action={<a href="/x">Bahçe ekleyin</a>} />,
    );
    expect(empty).toContain("<h2>Henüz bahçeniz yok</h2>");
    const header = renderToStaticMarkup(
      <PageHeader title="Bahçelerim" back={{ href: "/portal", label: "Geri" }} />,
    );
    expect(header).toMatch(/<h1[^>]*>Bahçelerim<\/h1>/);
  });
});
