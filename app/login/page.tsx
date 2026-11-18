"use client";
import { useActionState } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import { SealMark } from "@/components/SealMark";
import { signIn, type LoginState } from "./actions";
import styles from "./login.module.css";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel}>
        <div className={styles.brandInner}>
          <SealMark size={56} />
          <div className={styles.brandCopy}>
            <p className={styles.college}>Saveetha Engineering College</p>
            <h1 className={styles.product}>Prime Project Tracker</h1>
            <p className={styles.tagline}>Hackathons, internships, events and achievements, recorded and verified in one place.</p>
          </div>
        </div>
        <p className={styles.legal}>Access is by invitation. Your faculty or the college admin creates your account.</p>
      </aside>

      <main className={styles.formPanel}>
        <form action={action} className={`${styles.card} rise`}>
          <div className={styles.head}>
            <h2 className={styles.title}>Sign in</h2>
            <p className={styles.sub}>Use your college email or register number and your password.</p>
          </div>
          <div className="field">
            <label htmlFor="identifier">Email or register number</label>
            <input
              id="identifier"
              name="identifier"
              className="input"
              required
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@college.edu or 192110045"
              defaultValue={state.identifier ?? ""}
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? "form-error" : undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              required
              autoComplete="current-password"
              maxLength={72}
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? "form-error" : undefined}
            />
          </div>
          {state.error && (
            <p id="form-error" role="alert" className="error-text">
              <AlertCircle size={16} aria-hidden="true" /> {state.error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
            {pending ? "Signing in" : "Sign in"}
          </button>
          <p className="hint">Forgot your password? Ask the college admin to reset it.</p>
        </form>
      </main>
    </div>
  );
}
