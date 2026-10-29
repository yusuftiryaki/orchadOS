import type { ReactNode } from "react";
import styles from "./panel.module.css";

// A titled region of a screen: a heading (h2 or h3), an optional description
// and actions on the right, then the content on a bordered surface. `plain`
// drops the surface for a region that holds a table (the table has its own
// frame). Without a title it is just the surface (a form, a document).
export function Panel({
  title,
  description,
  actions,
  children,
  testId,
  plain = false,
  headingLevel = 2,
  id,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  testId?: string;
  plain?: boolean;
  headingLevel?: 2 | 3;
  id?: string;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const cls = plain ? styles.plain : styles.panel;
  return (
    <section
      className={className ? `${cls} ${className}` : cls}
      data-testid={testId}
      aria-labelledby={id && title ? `${id}-title` : undefined}
      id={id}
    >
      {(title || actions) && (
        <div className={styles.head}>
          {title && (
            <div className={styles.text}>
              <Heading id={id ? `${id}-title` : undefined} className={styles.title}>
                {title}
              </Heading>
              {description && <p className={styles.description}>{description}</p>}
            </div>
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// The surface of a Panel for markup that is not a section (a form, a list
// item): <form className={panelClass}>.
export const panelClass = styles.panel;
