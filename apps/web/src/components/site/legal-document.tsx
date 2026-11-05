import Link from "next/link";
import { Fragment } from "react";
import type { LegalBlock, LegalDocument, LegalListItem } from "@/lib/i18n/messages/legal";
import { siteText } from "@/lib/i18n/messages/site";
import { isDraftVersion } from "@/lib/legal/versions";
import { IconChevronDown, IconInfo } from "@/components/ui/icons";
import { LegalToc } from "./legal-toc";
import styles from "./pages.module.css";

// **bold** and [label](/path); everything else is plain text. [Placeholders]
// without a link target stay as they are.
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;

export function InlineText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    if (match[1] !== undefined) {
      parts.push(<strong key={index}>{match[1]}</strong>);
    } else {
      parts.push(
        <Link key={index} href={match[3]}>
          {match[2]}
        </Link>,
      );
    }
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function ListItem({ item }: { item: LegalListItem }) {
  if (typeof item === "string") {
    return (
      <li>
        <InlineText text={item} />
      </li>
    );
  }
  return (
    <li>
      <InlineText text={item.text} />
      <ul>
        {item.children.map((child, i) => (
          <ListItem key={i} item={child} />
        ))}
      </ul>
    </li>
  );
}

// An anchor for a heading: "8. Haklarınız (Kanun md. 11)" -> "8-haklariniz-kanun-md-11".
const TR_ASCII: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

export function headingId(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => TR_ASCII[c])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const plain = (text: string) =>
  text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "h2":
      return (
        <h2 id={headingId(plain(block.text))}>
          <InlineText text={block.text} />
        </h2>
      );
    case "h3":
      return (
        <h3>
          <InlineText text={block.text} />
        </h3>
      );
    case "p":
      return (
        <p>
          <InlineText text={block.text} />
        </p>
      );
    case "ul":
    case "ol": {
      const List = block.kind;
      return (
        <List>
          {block.items.map((item, i) => (
            <ListItem key={i} item={item} />
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i} scope="col">
                    <InlineText text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} data-label={plain(block.head[i] ?? "")}>
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function LegalDocumentView({
  document,
  version,
  contents = false,
}: {
  document: LegalDocument;
  version: string;
  // The public pages add in-page contents and "Başa dön"; the portal's
  // notice gate shows the bare text.
  contents?: boolean;
}) {
  const l = siteText.legal;
  const draft = isDraftVersion(version);
  const head = (
    <>
      <h1 className={styles.title} id="metin-basi">
        {document.title}
      </h1>
      <div className={styles.docMeta}>
        <p className={styles.version}>{l.version(version)}</p>
        {/* A draft is said once, quietly, under the title. */}
        {draft && (
          <p role="note" data-testid="draft-banner" className={styles.draftNote}>
            <IconInfo size={16} />
            <span>{l.draftBanner}</span>
          </p>
        )}
      </div>
    </>
  );
  const body = document.blocks.map((block, i) => (
    <Fragment key={i}>
      <Block block={block} />
    </Fragment>
  ));
  if (!contents) {
    return (
      <article className={styles.prose}>
        <header className={styles.legalHead}>{head}</header>
        {body}
      </article>
    );
  }

  const sections = document.blocks.flatMap((b) =>
    b.kind === "h2" ? [{ id: headingId(plain(b.text)), text: plain(b.text) }] : [],
  );
  const hasContents = sections.length > 2;
  return (
    <div className={hasContents ? styles.legal : `${styles.legal} ${styles.legalSingle}`}>
      <header className={styles.legalHead}>{head}</header>
      {hasContents && (
        <>
          <details className={`${styles.toc} ${styles.tocFold}`}>
            <summary>
              <span>{l.contents}</span>
              <IconChevronDown size={18} />
            </summary>
            <nav aria-label={l.contents}>
              <ol>
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>{s.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </details>
          <nav className={`${styles.toc} ${styles.tocColumn}`} aria-label={l.contents}>
            <p className={styles.tocTitle}>{l.contents}</p>
            <LegalToc sections={sections} />
          </nav>
        </>
      )}
      <article className={`${styles.prose} ${styles.paper}`} aria-labelledby="metin-basi">
        {body}
        <p className={styles.toTop}>
          <a href="#metin-basi">{l.toTop}</a>
        </p>
      </article>
    </div>
  );
}
