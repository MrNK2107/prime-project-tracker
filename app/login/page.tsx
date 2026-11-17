"use client";
import { useActionState } from "react";
import { requestCode, verifyCode, type LoginState } from "./actions";

const field = { display: "block", width: "100%", margin: "8px 0" } as const;

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    (prev, form) => (prev.step === "email" ? requestCode(prev, form) : verifyCode(prev, form)),
    { step: "email" },
  );

  return (
    <main style={{ maxWidth: 380, margin: "12vh auto", padding: 16 }}>
      <h1>Prime Project Tracker</h1>
      <form action={action}>
        {state.step === "email" ? (
          <>
            <label htmlFor="email">College email</label>
            <input id="email" name="email" type="email" required autoComplete="email" style={field} />
            <button type="submit" disabled={pending}>Send code</button>
          </>
        ) : (
          <>
            <p>If that account exists, a code was sent to {state.email}.</p>
            <input type="hidden" name="email" value={state.email} />
            <label htmlFor="token">Code</label>
            <input id="token" name="token" inputMode="numeric" required autoComplete="one-time-code" style={field} />
            <button type="submit" disabled={pending}>Sign in</button>
          </>
        )}
        {state.error && <p role="alert">{state.error}</p>}
      </form>
    </main>
  );
}
