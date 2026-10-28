import "server-only";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { FilledDocument } from "@/lib/contracts/render";
import { contractsText as C } from "@/lib/i18n/messages/contracts";
import type { LegalBlock, LegalListItem } from "@/lib/i18n/messages/legal";
import { COLORS, pdf, registerFonts } from "./theme";

// The order-specific contract documents as PDFs (docs/musteri-yonetimi.md
// "Sözleşme belgeleri (T04)"): the blocks of lib/contracts/render.ts, one
// document per file. Every page carries the version name, the order number
// and "Sayfa x/y"; a draft (draft version or incomplete company information)
// carries a "TASLAK" mark on every page. The same input and creation date give
// the same text; the creation date is the only date the renderer adds.

export const CONTRACT_PDF_GENERATOR = "web-contract-pdf-v1";

export async function contractPdf(doc: FilledDocument, createdAt = new Date()): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ContractDocument doc={doc} createdAt={createdAt} />);
}

// **bold** and [label](/path) → runs of text; links print their label.
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;

export function inlineRuns(text: string): { text: string; bold: boolean }[] {
  const runs: { text: string; bold: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) runs.push({ text: text.slice(last, index), bold: false });
    if (match[1] !== undefined) runs.push({ text: match[1], bold: true });
    else runs.push({ text: match[2], bold: false });
    last = index + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false });
  return runs;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineRuns(text).map((run, i) =>
        run.bold ? (
          <Text key={i} style={{ fontWeight: 700 }}>
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </>
  );
}

// One Text per item (marker and text): a flex row breaking across pages
// trips react-pdf's layout.
function Item({ item, marker, depth }: { item: LegalListItem; marker: string; depth: number }) {
  const text = typeof item === "string" ? item : item.text;
  return (
    <>
      <Text style={{ ...LH, marginLeft: 4 + depth * 12, marginBottom: 3 }}>
        {`${marker} `}
        <Inline text={text} />
      </Text>
      {typeof item !== "string"
        ? item.children.map((child, i) => (
            <Item key={i} item={child} marker="–" depth={depth + 1} />
          ))
        : null}
    </>
  );
}

const cell = (n: number) => ({ width: `${100 / n}%`, paddingVertical: 2, paddingHorizontal: 3 });

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "h2":
      return (
        <Text style={[pdf.h2, LH_H2, { marginTop: 8 }]}>
          <Inline text={block.text} />
        </Text>
      );
    case "h3":
      return (
        <Text style={[pdf.h3, LH, { marginTop: 4 }]}>
          <Inline text={block.text} />
        </Text>
      );
    case "p":
      return (
        <Text style={[pdf.p, LH]}>
          <Inline text={block.text} />
        </Text>
      );
    case "ul":
    case "ol":
      return (
        <>
          {block.items.map((item, i) => (
            <Item key={i} item={item} marker={block.kind === "ol" ? `${i + 1}.` : "•"} depth={0} />
          ))}
          <View style={{ height: 4 }} />
        </>
      );
    case "table":
      return (
        <View style={{ marginBottom: 8, borderTopWidth: 0.5, borderTopColor: COLORS.border }}>
          <View style={[pdf.row, { backgroundColor: COLORS.accentSoft }]} wrap={false}>
            {block.head.map((h, i) => (
              <Text
                key={i}
                style={[cell(block.head.length), { ...LH_SMALL, fontWeight: 700, fontSize: 8 }]}
              >
                <Inline text={h} />
              </Text>
            ))}
          </View>
          {block.rows.map((row, r) => (
            <View key={r} style={pdf.row} wrap={false}>
              {row.map((value, i) => (
                <Text key={i} style={[cell(row.length), { ...LH_SMALL, fontSize: 8 }]}>
                  <Inline text={value} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

// The page without its line height: a fixed footer inheriting one has it
// compounded from page to page by react-pdf (layout overflow on long
// documents); every body text sets its own (LH).
const PAGE = { ...pdf.page, lineHeight: undefined };
// In points: a unitless line height is compounded too.
const LH = { lineHeight: "14pt" };
const LH_SMALL = { lineHeight: "11pt" };
const LH_H2 = { lineHeight: "18pt" };

function ContractDocument({ doc, createdAt }: { doc: FilledDocument; createdAt: Date }) {
  const footer = C.pdf.footer(doc.version, doc.orderNumber ?? C.doc.unknown);
  return (
    <Document
      title={`${doc.title} · ${doc.orderNumber ?? ""}`}
      author="orchadOS"
      creator="orchadOS"
      producer="orchadOS"
      language="tr"
      creationDate={createdAt}
      modificationDate={createdAt}
    >
      <Page size="A4" style={PAGE}>
        {doc.draft ? (
          <Text
            fixed
            style={{
              position: "absolute",
              top: 14,
              right: 40,
              fontSize: 12,
              fontWeight: 700,
              color: "#c92a2a",
            }}
          >
            {C.pdf.draftMark}
          </Text>
        ) : null}
        <View style={pdf.header}>
          <View>
            <Text style={pdf.brand}>{`ORCHADOS · ${C.list.title.toLocaleUpperCase("tr-TR")}`}</Text>
            <Text style={pdf.title}>{doc.title}</Text>
            <Text style={pdf.subtitle}>{footer}</Text>
          </View>
        </View>
        {doc.draft ? (
          <View style={pdf.notice}>
            <Text>{C.doc.draft}</Text>
          </View>
        ) : null}
        {doc.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
        <View style={pdf.footer} fixed>
          <Text>{footer}</Text>
          <Text render={({ pageNumber, totalPages }) => C.pdf.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
