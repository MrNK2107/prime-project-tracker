import Link from "next/link";
import { CalendarDays, UsersRound } from "lucide-react";

/** Event-wise and student-wise tracking are two views of the same numbers; this switches between them. */
export function TrackingSwitch({ active, query = "" }: { active: "event" | "student"; query?: string }) {
  const item = (id: "event" | "student", href: string, label: string, icon: React.ReactNode) => (
    <Link href={href} className={`btn ${active === id ? "btn-primary" : "btn-secondary"}`} aria-current={active === id ? "page" : undefined}>
      {icon} {label}
    </Link>
  );
  return (
    <nav aria-label="Tracking view" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
      {item("event", `/faculty${query}`, "Track by event", <CalendarDays size={18} aria-hidden="true" />)}
      {item("student", `/students${query}`, "Track by student", <UsersRound size={18} aria-hidden="true" />)}
    </nav>
  );
}
