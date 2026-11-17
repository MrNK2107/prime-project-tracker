"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Mail } from "lucide-react";
import { SealMark } from "@/components/SealMark";
import { requestCode, verifyCode, type LoginState } from "./actions";
import styles from "./login.module.css";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    (prev, form) => (form.has("token") ? verifyCode(prev, form) : requestCode(prev, form)),
    { step: "email" },
  );
  // Lets the person go back to the email step (to fix a typo or ask for a new code) without a server round trip.
  const [backToEmail, setBackToEmail] = useState(false);
  const step = backToEmail ? "email" : state.step;
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
    else emailRef.current?.focus();
  }, [step]);

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
        <form
          action={(data) => {
            setBackToEmail(false);
            return action(data);
          }}
          className={`${styles.card} rise`}
          key={step}
          noValidate={false}
        >
          {step === "email" ? (
            <>
              <div className={styles.head}>
                <h2 className={styles.title}>Sign in</h2>
                <p className={styles.sub}>Enter your college email and we will send you a one-time code.</p>
              </div>
              <div className="field">
                <label htmlFor="email">College email</label>
                <input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  className="input"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@college.edu"
                  defaultValue={state.email ?? ""}
                  aria-invalid={state.error ? true : undefined}
                  aria-describedby={state.error ? "form-error" : undefined}
                />
              </div>
              {state.error && state.step === "email" && (
                <p id="form-error" role="alert" className="error-text">
                  <AlertCircle size={16} aria-hidden="true" /> {state.error}
                </p>
              )}
              <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
                {pending ? <span className="spinner" aria-hidden="true" /> : <Mail size={18} aria-hidden="true" />}
                {pending ? "Sending code" : "Send code"}
              </button>
            </>
          ) : (
            <>
              <div className={styles.head}>
                <h2 className={styles.title}>Check your email</h2>
                <p className={styles.sub}>
                  If <strong>{state.email}</strong> belongs to an active account, a code is on its way. It can take a minute to arrive.
                </p>
              </div>
              <input type="hidden" name="email" value={state.email ?? ""} />
              <div className="field">
                <label htmlFor="token">One-time code</label>
                <input
                  ref={codeRef}
                  id="token"
                  name="token"
                  className={`input ${styles.code}`}
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  placeholder="000000"
                  aria-invalid={state.error ? true : undefined}
                  aria-describedby={state.error ? "form-error" : undefined}
                />
              </div>
              {state.error && (
                <p id="form-error" role="alert" className="error-text">
                  <AlertCircle size={16} aria-hidden="true" /> {state.error} Check the code and try again, or request a new one.
                </p>
              )}
              <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
                {pending && <span className="spinner" aria-hidden="true" />}
                {pending ? "Signing in" : "Sign in"}
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => setBackToEmail(true)}>
                <ArrowLeft size={18} aria-hidden="true" /> Use a different email or get a new code
              </button>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
