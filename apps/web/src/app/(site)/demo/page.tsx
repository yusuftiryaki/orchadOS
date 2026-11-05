import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DEMO_END_PATH, demoGate, getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { demoText } from "@/lib/i18n/messages/demo";
import { DemoStartView } from "./demo-start-view";

const d = demoText.start;

export const metadata: Metadata = { title: d.title, description: d.metaDescription };

// /demo (docs/demo-turu.md §11.2): what the demo shows, what it keeps, and the
// start button. Only where this deployment serves the demo. ?bitti=1 after a
// demo ended.
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ bitti?: string | string[] }>;
}) {
  const flags = siteFlags();
  if (!flags.demoEnabled) notFound();
  const user = await getSessionUser();
  const { bitti } = await searchParams;
  const ended = bitti === "1";
  // A live demo session goes back to the portal; an ended one that still has
  // its cookie goes to /demo/bitti once, which clears it. On ?bitti=1 the page
  // renders whatever the session says, so the two can never bounce.
  if (user?.demo && !ended) redirect((await demoGate(user)) ? "/portal" : DEMO_END_PATH);

  return (
    <DemoStartView
      ended={ended}
      signedIn={!!user && !user.demo}
      turnstileSiteKey={flags.turnstileSiteKey}
      captchaProvider={flags.captchaProvider}
    />
  );
}
