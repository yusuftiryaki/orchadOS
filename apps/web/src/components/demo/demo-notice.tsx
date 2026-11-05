import { exitDemoAction } from "@/app/(site)/demo/actions";
import { IconInfo } from "@/components/ui/icons";
import { demoSignupLabel, demoText } from "@/lib/i18n/messages/demo";
import styles from "./demo.module.css";

// In place of a form a demo visitor cannot use (docs/demo-turu.md §11.5). With
// `signupNext` (demoSignupNext()) it also offers "Gerçek hesap aç", which ends
// the demo like the banner's button does.
export function DemoNotice({
  text = demoText.closed.generic,
  signupNext,
}: {
  text?: string;
  signupNext?: string;
}) {
  if (!signupNext) {
    return (
      <div className={styles.notice} role="note" data-testid="demo-notice">
        <IconInfo size={18} />
        <p>{text}</p>
      </div>
    );
  }
  return (
    <div className={`${styles.notice} ${styles.noticeCta}`} role="note" data-testid="demo-notice">
      <IconInfo size={18} />
      <p>{text}</p>
      <form action={exitDemoAction}>
        <input type="hidden" name="next" value={signupNext} />
        <button
          type="submit"
          className={`${styles.bannerButton} ${styles.bannerPrimary}`}
          data-testid="demo-notice-signup"
        >
          {demoSignupLabel(signupNext)}
        </button>
      </form>
    </div>
  );
}
