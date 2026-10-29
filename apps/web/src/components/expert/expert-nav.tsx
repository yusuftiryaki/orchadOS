import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { TabLinks } from "@/components/ui/tab-links";
import { t } from "@/lib/i18n";
import styles from "./expert.module.css";

// Header of the expert panel's own pages: the queue and the questions.
export function ExpertHeader({
  current,
  openQuestions,
}: {
  current: "queue" | "questions";
  openQuestions: number;
}) {
  const p = t.expert.panel;
  return (
    <>
      <PageHeader title={p.title} lead={p.lead} />
      <TabLinks
        label={p.nav}
        items={[
          { href: "/uzman", label: p.queue, current: current === "queue" },
          {
            href: "/uzman/sorular",
            current: current === "questions",
            label: (
              <span className={styles.tabLabel} data-testid="questions-link">
                {p.questions}{" "}
                {openQuestions > 0 && (
                  <Badge tone="warning">
                    {openQuestions}
                    <span className="sr-only"> {p.openQuestions(openQuestions)}</span>
                  </Badge>
                )}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
