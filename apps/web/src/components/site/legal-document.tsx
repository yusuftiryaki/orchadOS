import Link from "next/link";
import { Fragment } from "react";
import type { LegalBlock, LegalDocument, LegalListItem } from "@/lib/i18n/messages/legal";
import { siteText } from "@/lib/i18n/messages/site";
import { isDraftVersion } from "@/lib/legal/versions";
import styles from "./site.module.css";

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

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "h2":
      return (
        <h2>
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
                    <td key={i}>
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
}: {
  document: LegalDocument;
  version: string;
}) {
  return (
    <article className={styles.prose}>
      {isDraftVersion(version) && (
        <p className={styles.draftBanner} role="note" data-testid="draft-banner">
          {siteText.legal.draftBanner}
        </p>
      )}
      <h1>{document.title}</h1>
      <p className={styles.version}>{siteText.legal.version(version)}</p>
      {document.blocks.map((block, i) => (
        <Fragment key={i}>
          <Block block={block} />
        </Fragment>
      ))}
    </article>
  );
}
