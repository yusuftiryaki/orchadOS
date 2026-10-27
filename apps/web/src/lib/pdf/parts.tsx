import "server-only";
import { Text, View } from "@react-pdf/renderer";
import { t } from "@/lib/i18n";
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
