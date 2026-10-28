import Link from "next/link";
import { siteText } from "@/lib/i18n/messages/site";

// "Demoyu dene" under the login form, only when this site links to a demo
// (siteFlags().demoUrl; docs/demo-turu.md §11.1).
export function DemoLink({ demoUrl }: { demoUrl: string | null }) {
  if (!demoUrl) return null;
  return (
    <p data-testid="login-demo">
      <Link href={demoUrl}>{siteText.login.tryDemo}</Link>
    </p>
  );
}
