"use client";

import { useState, type ComponentProps } from "react";
import { IconEye, IconEyeOff } from "@/components/ui/icons";
import { t } from "@/lib/i18n";
import styles from "./auth.module.css";

// A password input with a show/hide toggle inside its right edge. Field
// (src/components/ui/field.tsx) clones its child with id, aria-describedby
// and aria-invalid; they go to the input. The toggle keeps one name
// ("Parolayı göster") and says its state with aria-pressed; the name is
// button text, not aria-label, so getByLabel("Parola") still finds only the
// input.
export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className={styles.password}>
      <input {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        className={styles.reveal}
        aria-pressed={shown}
        aria-controls={props.id}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? <IconEyeOff size={20} /> : <IconEye size={20} />}
        <span className="sr-only">{t.login.showPassword}</span>
      </button>
    </div>
  );
}
