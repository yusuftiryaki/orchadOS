import { SectionShell } from "@/components/section-shell";
import { requireSection } from "@/lib/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireSection("operasyon");
  return (
    <SectionShell user={user} section="operasyon">
      {children}
    </SectionShell>
  );
}
