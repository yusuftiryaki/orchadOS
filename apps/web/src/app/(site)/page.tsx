import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { defaultSection } from "@/lib/auth/roles";
import { t } from "@/lib/i18n";
import { signOut } from "./actions";

export default async function HomePage() {
  const user = await requireUser();
  const section = defaultSection(user.roles);
  if (section) redirect(`/${section}`);

  return (
    <main className="centered">
      <div className="card">
        <p>{t.home.noRoles}</p>
        <form action={signOut}>
          <button className="button button-secondary" type="submit">
            {t.nav.logout}
          </button>
        </form>
      </div>
    </main>
  );
}
