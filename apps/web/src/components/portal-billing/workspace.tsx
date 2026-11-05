import Link from "next/link";
import type { ReactNode } from "react";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import s from "./workspace.module.css";

// Building blocks of the customer's work screens (applications, quotes,
// orders, payments, services): the detail header, the lifecycle track, the
// two-column detail layout with a sticky summary object, plain sections, the
// activity timeline and the list frame that turns into rows on a phone.
// Second design pass: sections are not cards; the summary (a quote's total,
// what an order still owes) is the one raised object of a view.

// The top of a detail screen: back link, the title with its state badge
// beside it (outside the h1, so the heading reads as the title alone), the
// screen's main action on the right and a short lead.
export function DetailHeader({
  title,
  badges,
  lead,
  actions,
  back,
}: {
  title: ReactNode;
  badges?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className={s.header}>
      {back && (
        <Link href={back.href} className={s.back}>
          {back.label}
        </Link>
      )}
      <div className={s.headRow}>
        <div className={s.headText}>
          <div className={s.titleRow}>
            <h1 className={s.title}>{title}</h1>
            {badges && <div className={s.badges}>{badges}</div>}
          </div>
          {lead && <p className={s.lead}>{lead}</p>}
        </div>
        {actions && <div className={s.headActions}>{actions}</div>}
      </div>
    </header>
  );
}

export type StepState = "done" | "current" | "upcoming";
export type FlowNote = keyof typeof P.flow.notes;

// Application → quote → payment → service as a track of dots: done steps
// are filled kernel-green, the current one carries the hull ring, the rest
// are outlined. `current` is the index of the step in progress (4: all
// done); `note` says where that step stands.
export function Lifecycle({ current, note }: { current: number; note?: FlowNote }) {
  const F = P.flow;
  return (
    <ol className={s.steps} aria-label={F.label} data-testid="lifecycle">
      {F.steps.map((label, i) => {
        const state: StepState = i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <li
            key={label}
            className={s.step}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className={s.stepDot} aria-hidden />
            <span className={s.stepText}>
              <span className={s.stepLabel}>{label}</span>
              {state === "current" && note && <span className={s.stepNote}>{F.notes[note]}</span>}
              <span className="sr-only">{`, ${F.stepState[state]}`}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Main content and a summary on the side. From a laptop up the side column
// is sticky; on a phone it follows the content, or leads it (`asideFirst`)
// when the summary is what the reader needs first (a quote's total).
// `end` closes the main column (an action that undoes: withdraw, cancel);
// on a phone it comes after the summary, so the way forward is read first.
export function DetailLayout({
  children,
  aside,
  end,
  asideFirst = false,
}: {
  children: ReactNode;
  aside: ReactNode;
  end?: ReactNode;
  asideFirst?: boolean;
}) {
  return (
    <div className={s.detail} data-aside-first={asideFirst || undefined}>
      <div className={s.main}>{children}</div>
      <div className={s.aside}>{aside}</div>
      {end && <div className={s.end}>{end}</div>}
    </div>
  );
}

// The summary of the side column: a heading, the figure the view is about
// (a total, what is due) in large type, the rows behind it and the primary
// action. It is the one raised object of a view; `quiet` keeps it flat when
// another object leads the page (the pay box of an order).
export function SummaryCard({
  title,
  figure,
  children,
  footer,
  testId,
  id,
  quiet = false,
}: {
  title: ReactNode;
  figure?: { label: ReactNode; value: ReactNode; testId?: string; note?: ReactNode };
  children?: ReactNode;
  footer?: ReactNode;
  testId?: string;
  id: string;
  quiet?: boolean;
}) {
  return (
    <section
      className={s.card}
      data-quiet={quiet || undefined}
      aria-labelledby={`${id}-title`}
      data-testid={testId}
      id={id}
    >
      <h2 id={`${id}-title`} className={s.cardTitle}>
        {title}
      </h2>
      {figure && (
        <div className={s.cardFigure}>
          <p className={s.figureLabel}>{figure.label}</p>
          <p className={s.figureValue} data-testid={figure.testId}>
            {figure.value}
          </p>
          {figure.note && <p className={s.figureNote}>{figure.note}</p>}
        </div>
      )}
      {children && <div className={s.cardBody}>{children}</div>}
      {footer && <div className={s.cardFooter}>{footer}</div>}
    </section>
  );
}

// A titled block of the main column: heading, an optional one-line
// description and actions, then the content. A section is not a card: it is
// set apart by space; only its content frames itself when it is a table, a
// form or a list of rows.
export function Section({
  title,
  description,
  actions,
  children,
  testId,
  id,
  headingLevel = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
  id?: string;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      className={s.section}
      data-testid={testId}
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <div className={s.sectionHead}>
        <div className={s.sectionText}>
          <H className={s.sectionTitle} id={id ? `${id}-title` : undefined}>
            {title}
          </H>
          {description && <p className={s.sectionDescription}>{description}</p>}
        </div>
        {actions && <div className={s.sectionActions}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}

// What happened, oldest first: a dot and a line per event, the time under
// the text.
export function Timeline({
  items,
  testId,
}: {
  items: { key: string | number; at: string; time: string; content: ReactNode }[];
  testId?: string;
}) {
  return (
    <ol className={s.timeline} data-testid={testId}>
      {items.map((e, i) => (
        <li key={e.key} data-latest={i === items.length - 1 || undefined}>
          <span className={s.timelineDot} aria-hidden />
          <span className={s.timelineText}>{e.content}</span>
          <time dateTime={e.at} className={s.timelineTime}>
            {e.time}
          </time>
        </li>
      ))}
    </ol>
  );
}

// The class names of a list table (Başvurularım, Siparişlerim, Ödemelerim,
// Hizmetlerim): a framed table on a wide column whose rows become tappable
// stacked rows under 640px. The first link of a row (`rowLink`) covers the row.
export const listClass = {
  box: s.listBox,
  table: s.list,
  rowLink: s.rowLink,
  primary: s.cellPrimary,
  sub: s.cellSub,
  num: s.cellNum,
  status: s.cellStatus,
  muted: s.cellMuted,
  chevron: s.cellChevron,
  hideNarrow: s.hideNarrow,
};

// A document number ("B-2026-000001", "S-2026-000003") in the mono face,
// one step smaller than the text around it, never broken across lines.
export function Ident({ children }: { children: ReactNode }) {
  return <span className={s.ident}>{children}</span>;
}

// Items of a meta line ("Antep fıstığı  Kayalar, Nizip  Sınır yok") set
// apart by space instead of a " · " string; empty items are skipped.
export function Meta({ items, className }: { items: ReactNode[]; className?: string }) {
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== "");
  return (
    <p className={`${s.meta}${className ? ` ${className}` : ""}`}>
      {shown.map((x, i) => (
        <span key={i}>{x}</span>
      ))}
    </p>
  );
}

// Class names shared by the work screens.
export const workClass = s;
