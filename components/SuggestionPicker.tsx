"use client";
import { useMemo, useState } from "react";
import { Lightbulb, Search, ExternalLink } from "lucide-react";
import type { Suggestion } from "@/lib/faculty/suggestions";

const PAGE = 8;

function setValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value); // so React-free inputs still fire their events
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Hackathons and internships to consider. Choosing one only fills the form below (title, details, link, reply-by date,
 * and the usual confirmation and proof settings); nothing is posted and nobody is invited until the person picks an
 * audience and creates the event.
 */
export function SuggestionPicker({ suggestions }: { suggestions: Suggestion[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "hackathon" | "internship">("all");
  const [shown, setShown] = useState(PAGE);
  const [used, setUsed] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return suggestions.filter((s) => (kind === "all" || s.kind === kind) && (!needle || `${s.title} ${s.organiser ?? ""}`.toLowerCase().includes(needle)));
  }, [suggestions, q, kind]);

  function use(s: Suggestion) {
    const radio = document.querySelector<HTMLInputElement>(`input[name="type"][value="${s.kind}"]`);
    if (radio) radio.click();
    setValue("title", s.title);
    setValue("description", s.description);
    setValue("meetingUrl", s.link ?? "");
    setValue("deadline", s.deadlineInput);
    for (const name of ["requiresConfirmation", "requiresProof"]) {
      const box = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (box && !box.checked) box.click();
    }
    setUsed(s.id);
    document.getElementById("title")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (suggestions.length === 0) return null;
  const tabs = [["all", "All"], ["hackathon", "Hackathons"], ["internship", "Internships"]] as const;

  return (
    <details className="panel rise" style={{ marginBottom: "1.25rem" }} open>
      <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 650 }}>
        <Lightbulb size={18} aria-hidden="true" /> Suggestions <span className="muted" style={{ fontWeight: 500 }}>({suggestions.length}) · nothing is posted until you create the event</span>
      </summary>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "0.75rem 0", alignItems: "center" }}>
        <label className="visually-hidden" htmlFor="suggestion-search">Search suggestions</label>
        <div style={{ position: "relative", flex: "1 1 14rem" }}>
          <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: 15, color: "var(--ink-3)" }} />
          <input id="suggestion-search" className="input" style={{ paddingLeft: 36 }} placeholder="Search by name or organiser" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
        </div>
        <div style={{ display: "flex", gap: "0.35rem" }} role="group" aria-label="Kind">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" className={`btn ${kind === id ? "btn-primary" : "btn-secondary"}`} aria-pressed={kind === id} onClick={() => { setKind(id); setShown(PAGE); }}>{label}</button>
          ))}
        </div>
      </div>

      {list.length === 0 ? <p className="muted">No suggestions match.</p> : (
        <ul style={{ listStyle: "none", display: "grid", gap: "0.5rem", padding: 0 }}>
          {list.slice(0, shown).map((s) => (
            <li key={s.id} className="record" style={{ display: "flex", gap: "0.75rem", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 16rem" }}>
                <div style={{ fontWeight: 650 }}>{s.title}</div>
                <div className="secondary" style={{ color: "var(--ink-2)", fontSize: "var(--step--1)" }}>
                  {s.kind === "hackathon" ? "Hackathon" : "Internship"}
                  {s.organiser && s.kind === "hackathon" ? ` · ${s.organiser}` : ""}
                  {s.priority ? ` · ${s.priority}` : ""}
                  {s.deadline ? ` · closes ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(s.deadline))}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {s.link && <a href={s.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" aria-label={`Open ${s.title}`}><ExternalLink size={16} aria-hidden="true" /></a>}
                <button type="button" className="btn btn-secondary" onClick={() => use(s)}>{used === s.id ? "Filled below" : "Use this"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.length > shown && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: "0.5rem" }} onClick={() => setShown((n) => n + PAGE * 4)}>Show more ({list.length - shown} left)</button>
      )}
    </details>
  );
}
