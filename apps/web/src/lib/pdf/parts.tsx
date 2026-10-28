import "server-only";
import { Text, View } from "@react-pdf/renderer";
import { t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import { pdf } from "./theme";

// Building blocks shared by the PDF reports.

export function Header({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={pdf.header} fixed={false}>
      <View>
        <Text style={pdf.brand}>{`ORCHADOS · ${kicker.toLocaleUpperCase("tr-TR")}`}</Text>
        <Text style={pdf.title}>{title}</Text>
        {subtitle ? <Text style={pdf.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Footer({ left }: { left: string }) {
  return (
    <View style={pdf.footer} fixed>
      <Text>{`${t.app.name} · ${left}`}</Text>
      <Text
        render={({ pageNumber, totalPages }) => t.inventoryReport.page(pageNumber, totalPages)}
      />
    </View>
  );
}

// Every page of a demo PDF (docs/demo-turu.md §11.6): a diagonal "ÖRNEK RAPOR"
// across the page and "Sentetik demo verisi" above the footer.
export function SampleWatermark() {
  return (
    <>
      <View
        fixed
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            transform: "rotate(-35deg)",
            fontSize: 30,
            fontWeight: 700,
            color: "#c92a2a",
            opacity: 0.18,
            textAlign: "center",
            width: 640,
          }}
        >
          {demoText.pdf.watermark}
        </Text>
      </View>
      <Text
        fixed
        style={{
          position: "absolute",
          bottom: 8,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 8,
          color: "#c92a2a",
        }}
      >
        {demoText.pdf.footer}
      </Text>
    </>
  );
}

// Document properties of a demo PDF: the ASCII sample marker in the Info
// dictionary, which is not compressed and so found by a byte search.
export function sampleInfo(demo: boolean | undefined): { subject?: string; keywords?: string } {
  return demo ? { subject: demoText.pdf.keywords, keywords: demoText.pdf.keywords } : {};
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={pdf.bullet}>
          <Text style={pdf.bulletDot}>•</Text>
          <Text style={pdf.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}
