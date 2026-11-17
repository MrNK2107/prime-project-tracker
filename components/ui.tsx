import type { ReactNode } from "react";

/** Serif page title with an optional supporting line and one primary action on the right. */
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div
      className="rise"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem" }}
    >
      <div style={{ display: "grid", gap: "0.35rem" }}>
        <h1>{title}</h1>
        {description && <p style={{ color: "var(--ink-2)" }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** An empty list is a normal state, never an error: say what belongs here and what to do next. */
export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <section className="empty rise" aria-live="polite">
      <span className="empty-icon" aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </section>
  );
}
