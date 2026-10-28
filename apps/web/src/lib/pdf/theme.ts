import "server-only";
import path from "node:path";
import { Font, StyleSheet } from "@react-pdf/renderer";

// Shared look of the PDF reports. Noto Sans (SIL OFL 1.1, fonts/OFL.txt) has
// every Turkish letter; the built-in PDF fonts do not.

const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");

let registered = false;
export function registerFonts() {
  if (registered) return;
  Font.register({
    family: "Noto Sans",
    fonts: [
      { src: path.join(FONT_DIR, "NotoSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "NotoSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Turkish words must not be split by the English hyphenation rules.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

export const COLORS = {
  text: "#1c2419",
  muted: "#5f6b5f",
  border: "#dfe3da",
  accent: "#3f7d20",
  accentSoft: "#eef4e8",
  warnBg: "#fff6db",
  warnBorder: "#f2d46b",
};

export const pdf = StyleSheet.create({
  page: {
    fontFamily: "Noto Sans",
    fontSize: 10,
    color: COLORS.text,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    lineHeight: 1.45,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
    paddingBottom: 10,
    marginBottom: 16,
  },
  brand: { fontSize: 9, color: COLORS.accent, fontWeight: 700, letterSpacing: 1 },
  title: { fontSize: 20, fontWeight: 700, marginTop: 2 },
  subtitle: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  section: { marginBottom: 14 },
  h2: { fontSize: 13, fontWeight: 700, marginBottom: 6, color: COLORS.text },
  h3: { fontSize: 10.5, fontWeight: 700, marginBottom: 4 },
  p: { marginBottom: 4 },
  muted: { color: COLORS.muted, fontSize: 9 },
  statRow: { flexDirection: "row", gap: 8, marginVertical: 6 },
  stat: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 8,
    backgroundColor: "#fafbf8",
  },
  statValue: { fontSize: 18, fontWeight: 700 },
  statLabel: { fontSize: 8.5, color: COLORS.muted },
  notice: {
    backgroundColor: COLORS.warnBg,
    borderWidth: 1,
    borderColor: COLORS.warnBorder,
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  columns: { flexDirection: "row", gap: 16 },
  column: { flexGrow: 1, flexBasis: 0 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingVertical: 2,
  },
  // Report and inventory pages: room for the boundary notice above the footer.
  reportPage: {
    fontFamily: "Noto Sans",
    fontSize: 10,
    color: COLORS.text,
    paddingTop: 40,
    paddingBottom: 84,
    paddingHorizontal: 40,
    lineHeight: 1.45,
  },
  boundaryNotice: {
    position: "absolute",
    bottom: 36,
    left: 40,
    right: 40,
    fontSize: 7.5,
    lineHeight: 1.35,
    color: COLORS.muted,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLORS.muted,
  },
});
