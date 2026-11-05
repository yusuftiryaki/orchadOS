import { Fragment } from "react";
import { InlineText } from "@/components/site/legal-document";
import type { FilledDocument } from "@/lib/contracts/render";
import { contractsText as C } from "@/lib/i18n/messages/contracts";
import type { LegalBlock, LegalListItem } from "@/lib/i18n/messages/legal";
import { siteText } from "@/lib/i18n/messages/site";
import styles from "./contracts.module.css";

// A filled contract document on the quote page: exactly the fields that
// display_sha256 covers (lib/contracts/display-hash.ts): the title, the
// version, the draft mark and the blocks in order. Nothing else is rendered
// inside the frame.

function Item({ item }: { item: LegalListItem }) {
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
          <Item key={i} item={child} />
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
            <Item key={i} item={item} />
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

export function FilledDocumentView({
  doc,
  displaySha256,
}: {
  doc: FilledDocument;
  displaySha256: string;
}) {
  return (
    <article
      className={styles.document}
      data-testid={`filled-${doc.kind}`}
      data-display-sha256={displaySha256}
      tabIndex={0}
    >
      {doc.draft && (
        <p className={styles.draft} role="note" data-testid="filled-draft">
          {C.doc.draft}
        </p>
      )}
      <h3 className={styles.title}>{doc.title}</h3>
      <p className={styles.version}>{siteText.legal.version(doc.version)}</p>
      {doc.blocks.map((block, i) => (
        <Fragment key={i}>
          <Block block={block} />
        </Fragment>
      ))}
    </article>
  );
}
