import { SectionShell } from "@/components/section-shell";
import { requireSection } from "@/lib/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireSection("ofis");
  return (
    <SectionShell user={user} section="ofis">
      {children}
    </SectionShell>
  );
}
