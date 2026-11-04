import type { ReactNode } from "react";
import layout from "@/components/portal/page.module.css";
import { ButtonLink } from "@/components/ui/button";
import { IconAlert, IconClipboard } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { formatKurus } from "@/lib/billing/money";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { CustomerSummary } from "@/lib/portal-billing/data";
import { portalHref } from "@/lib/portal-billing/urls";
import { MembershipCard } from "./membership-card";
import { NumberedTitle } from "./numbered-title";
import styles from "./home.module.css";

const H = P.home;
const M = P.membership;

interface Task {
  key: string;
  testId?: string;
  title: string;
  body: ReactNode;
  href: string;
  action: string;
  // Waiting on the customer (quote, payment, draft) or only on us (review).
  yours: boolean;
}

// The top of the portal home (§10): what waits on the customer, then the
// membership. Open quotes, orders awaiting payment and a draft are the
// customer's to do; an application under review is ours and only reported.
// The first task the customer can act on carries the page's one primary
// button. The call to register a garden only when there is nothing yet: no
// open task and no garden. An owner or co-owner with gardens (also one whose
// order just activated) never gets it; a customer whose application was
// withdrawn or order cancelled does, so the page is never empty.
//
// IP14 (docs/bahce-yonetimi.md §11): a member sees "Üyeliğiniz" and, while
// the garden switch is on and no draft is open, a block to add a garden. A
// customer whose last garden left (only removed gardens, no period) is told
// the membership ended and may apply again.
export function CustomerHome({
  summary,
  hasParcels,
  children,
}: {
  summary: CustomerSummary;
  hasParcels: boolean;
  // The garden list: under the tasks, beside the membership on a desktop.
  children?: ReactNode;
}) {
  const tasks: Task[] = [];
  for (const quote of summary.openQuotes) {
    tasks.push({
      key: `q-${quote.id}`,
      testId: "home-quote",
      title: H.quoteTitle,
      body: (
        <NumberedTitle
          text={H.quoteBody(
            quote.number,
            formatKurus(quote.total_kurus, quote.currency),
            formatDate(quote.valid_until),
          )}
          number={quote.number}
        />
      ),
      href: portalHref.quote(quote.id),
      action: H.quoteButton,
      yours: true,
    });
  }
  for (const order of summary.awaitingOrders) {
    tasks.push({
      key: `o-${order.id}`,
      testId: "home-order",
      title: H.orderTitle,
      body: <NumberedTitle text={H.orderBody(order.number)} number={order.number} />,
      href: portalHref.order(order.id),
      action: H.orderButton,
      yours: true,
    });
  }
  if (summary.draft) {
    tasks.push({
      key: "draft",
      testId: "home-draft",
      title: H.draftTitle,
      body: H.draftBody,
      href: portalHref.application(summary.draft.id),
      action: H.draftButton,
      yours: true,
    });
  }
  for (const application of summary.openApplications) {
    tasks.push({
      key: `a-${application.id}`,
      title: H.reviewTitle,
      body: (
        <NumberedTitle text={H.reviewBody(application.number ?? "")} number={application.number} />
      ),
      href: portalHref.application(application.id),
      action: H.reviewButton,
      yours: false,
    });
  }

  const period = summary.servicePeriod;
  const ended =
    !period && summary.gardens.length > 0 && summary.gardens.every((g) => g.state === "removed");
  const canAdd = !!period?.garden_changes_enabled && !summary.draft;
  const primary = tasks.findIndex((task) => task.yours);

  let start: ReactNode = null;
  if (tasks.length === 0 && ended) {
    start = (
      <Start testId="home-ended" title={M.endedTitle} body={M.endedBody} action={H.ctaButton} />
    );
  } else if (tasks.length === 0 && !period && !hasParcels) {
    start = <Start testId="home-cta" title={H.ctaTitle} body={H.ctaBody} action={H.ctaButton} />;
  }

  if (tasks.length === 0 && !period && !start) return children ?? null;
  return (
    <div
      className={period ? `${styles.top} ${styles.withAside}` : styles.top}
      data-has-parcels={hasParcels || undefined}
    >
      <div className={styles.main}>
        {tasks.length > 0 && (
          <Panel title={H.tasksTitle} id="tasks" className={styles.tasksPanel}>
            <ul className={styles.tasks}>
              {tasks.map((task, i) => (
                <li
                  key={task.key}
                  className={task.yours ? styles.task : `${styles.task} ${styles.taskOurs}`}
                  data-testid={task.testId}
                >
                  <span className={styles.taskIcon} aria-hidden>
                    {task.yours ? <IconAlert size={18} /> : <IconClipboard size={18} />}
                  </span>
                  <div className={styles.taskText}>
                    <h3>{task.title}</h3>
                    <p>{task.body}</p>
                  </div>
                  <ButtonLink
                    href={task.href}
                    variant={i === primary ? "primary" : task.yours ? "secondary" : "quiet"}
                    className={styles.taskAction}
                  >
                    {task.action}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {start}
        {children && tasks.length > 0 ? (
          <Panel title={H.gardensTitle} plain id="gardens" className={styles.gardensBlock}>
            {children}
          </Panel>
        ) : (
          children
        )}
      </div>
      {period && (
        <aside className={styles.member} aria-label={M.title}>
          <MembershipCard period={period} />
          {canAdd && (
            <div className={styles.add} data-testid="home-add-garden">
              <h3>{M.addTitle}</h3>
              <p className={layout.small}>{M.addBody}</p>
              <ButtonLink variant="secondary" href={portalHref.newApplication()}>
                {M.addButton}
              </ButtonLink>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

// Nothing on the account yet, or nothing left: one call to apply.
function Start({
  testId,
  title,
  body,
  action,
}: {
  testId: string;
  title: string;
  body: string;
  action: string;
}) {
  return (
    <section className={styles.start} data-testid={testId} aria-labelledby={`${testId}-title`}>
      <span className={styles.startGrid} aria-hidden />
      <h2 id={`${testId}-title`}>{title}</h2>
      <p>{body}</p>
      <ol className={styles.steps}>
        {H.ctaSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <ButtonLink href={portalHref.newApplication()} size="lg">
        {action}
      </ButtonLink>
    </section>
  );
}
