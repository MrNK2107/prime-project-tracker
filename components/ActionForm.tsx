"use client";
import { useActionState, useEffect, useRef, startTransition, type ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export type FormResult = { ok: boolean; message: string } | null;
export type FormAction = (prev: FormResult, data: FormData) => Promise<FormResult>;

/**
 * A form that runs a server action, keeps what you typed when it fails, clears itself when it
 * works, and announces the outcome. `compact` renders the message beside the button (row actions).
 */
export function ActionForm({
  action,
  children,
  submit,
  pendingLabel,
  variant = "primary",
  compact = false,
  confirm,
  className,
}: {
  action: FormAction;
  children?: ReactNode;
  submit: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  compact?: boolean;
  confirm?: string;
  className?: string;
}) {
  const [result, dispatch, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className={className}
      style={compact ? { display: "inline-flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" } : { display: "grid", gap: "0.875rem" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          dispatch(data);
        });
      }}
    >
      {children}
      <div style={compact ? { display: "inline-flex", alignItems: "center", gap: "0.5rem" } : { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="submit" className={`btn btn-${variant}`} disabled={pending} style={compact ? { minHeight: 40 } : undefined}>
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? (pendingLabel ?? "Saving") : submit}
        </button>
        <ResultMessage result={result} formRef={ref} pending={pending} />
      </div>
    </form>
  );
}

function ResultMessage({ result, formRef, pending }: { result: FormResult; formRef: React.RefObject<HTMLFormElement | null>; pending: boolean }) {
  // Clear the fields once, after a successful save (a failure keeps what was typed).
  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result, formRef]);
  if (!result || pending) return <span role="status" aria-live="polite" className="visually-hidden" />;
  return result.ok ? (
    <p role="status" style={{ display: "flex", gap: "0.4rem", alignItems: "center", color: "var(--seal)", fontWeight: 600, fontSize: "var(--step--1)" }}>
      <CheckCircle2 size={16} aria-hidden="true" /> {result.message}
    </p>
  ) : (
    <p role="alert" className="error-text" style={{ margin: 0 }}>
      <AlertCircle size={16} aria-hidden="true" /> {result.message}
    </p>
  );
}
