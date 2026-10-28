import type { LegalBlock, LegalListItem } from "@/lib/i18n/messages/legal";

// Converts a draft in docs/hukuk/ to the blocks the site shows, so that the
// site text in legal.ts can be checked against (and regenerated from) its
// source. Only the Markdown the drafts use is supported: ## and ### headings,
// paragraphs, - and 1. lists nested by four spaces, tables and blockquotes.
//
// Left out: the title, the drafting notes before the "**Sürüm:**" line, that
// line itself and signature lines (____). Links to other drafts become their
// public paths; any other link is an error.

const PUBLIC_PATHS: Record<string, string> = {
  "kvkk-aydinlatma-metni.md": "/kvkk",
  "acik-riza-metni.md": "/acik-riza",
  "bahcede-bulunanlar-aydinlatma-metni.md": "/bahcede-bulunanlar",
  "gizlilik-cerez-politikasi-taslagi.md": "/gizlilik",
  "hizmet-sozlesmesi-taslagi.md": "/mesafeli-satis",
  "on-bilgilendirme-formu-taslagi.md": "/on-bilgilendirme",
  "iptal-iade-politikasi-taslagi.md": "/iade",
};

function inline(text: string): string {
  return text.replace(/`([^`]*)`/g, "$1").replace(/\]\(([^)\s]+)\)/g, (_, target: string) => {
    const path = PUBLIC_PATHS[target];
    if (!path) throw new Error(`no public page for link target ${target}`);
    return `](${path})`;
  });
}

const LIST_ITEM = /^( *)(?:-|\d+\.) (.*)$/;

interface Node {
  text: string;
  children: Node[];
}

function toItem(node: Node): LegalListItem {
  return node.children.length === 0
    ? node.text
    : { text: node.text, children: node.children.map(toItem) };
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => inline(c.trim()));
}

export function blocksFromMarkdown(markdown: string): LegalBlock[] {
  const lines = markdown.split("\n");
  const versionLine = lines.findIndex((l) => l.startsWith("**Sürüm:**"));
  if (versionLine < 0) throw new Error("draft has no **Sürüm:** line");
  const body = lines.slice(versionLine + 1);

  const blocks: LegalBlock[] = [];
  let i = 0;
  while (i < body.length) {
    const line = body[i];
    if (line.trim() === "" || line.includes("____")) {
      i++;
    } else if (line.startsWith("### ")) {
      blocks.push({ kind: "h3", text: inline(line.slice(4)) });
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push({ kind: "h2", text: inline(line.slice(3)) });
      i++;
    } else if (line.startsWith("#")) {
      throw new Error(`unsupported heading on body line ${versionLine + 2 + i}: ${line}`);
    } else if (line.startsWith("|")) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2; // header and separator
      while (i < body.length && body[i].startsWith("|")) rows.push(cells(body[i++]));
      blocks.push({ kind: "table", head, rows });
    } else if (LIST_ITEM.test(line)) {
      const kind = /^\d/.test(line) ? "ol" : "ul";
      const roots: Node[] = [];
      const stack: Node[] = [];
      while (i < body.length && LIST_ITEM.test(body[i])) {
        const [, indent, text] = LIST_ITEM.exec(body[i])!;
        const depth = indent.length / 4;
        if (!Number.isInteger(depth) || depth > stack.length) {
          throw new Error(`bad list indent: ${body[i]}`);
        }
        const node: Node = { text: inline(text), children: [] };
        stack.length = depth;
        (depth === 0 ? roots : stack[depth - 1].children).push(node);
        stack.push(node);
        i++;
      }
      blocks.push({ kind, items: roots.map(toItem) });
    } else {
      const paragraph: string[] = [];
      while (
        i < body.length &&
        body[i].trim() !== "" &&
        !/^(#|\||( *)(-|\d+\.) )/.test(body[i]) &&
        !body[i].includes("____")
      ) {
        paragraph.push(body[i].replace(/^> ?/, "").trim());
        i++;
      }
      // Every branch above consumes a line; a paragraph that took none would loop.
      if (paragraph.length === 0) throw new Error(`unsupported line: ${line}`);
      blocks.push({ kind: "p", text: inline(paragraph.join(" ")) });
    }
  }
  return blocks;
}
