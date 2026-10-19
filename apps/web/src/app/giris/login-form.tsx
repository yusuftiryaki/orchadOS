"use client";

import { useActionState, useState } from "react";
import { t } from "@/lib/i18n";
import { signInWithPassword, type LoginState } from "./actions";
import { LOGIN_METHODS, type LoginMethod } from "./login-methods";
import styles from "./login.module.css";

export function LoginForm({ next }: { next: string }) {
  const [method, setMethod] = useState<LoginMethod>("password");

  return (
    <div>
      <div className={styles.methods} role="tablist">
        {LOGIN_METHODS.map(({ id, enabled }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={method === id}
            disabled={!enabled}
            className={method === id ? styles.methodActive : styles.method}
            onClick={() => setMethod(id)}
          >
            {t.login.methods[id]}
          </button>
        ))}
      </div>
      {method === "password" && <PasswordForm next={next} />}
    </div>
  );
}

function PasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, {
    error: null,
  });

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <label className={styles.field}>
        <span>{t.login.email}</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className={styles.field}>
        <span>{t.login.password}</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? t.login.submitting : t.login.submit}
      </button>
    </form>
  );
}
