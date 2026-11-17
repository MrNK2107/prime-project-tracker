"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export type PickerStudent = { id: string; name: string; sub: string };

/** Search and tick specific students. Ticked ids are submitted as repeated `studentIds` fields. */
export function StudentPicker({ students }: { students: PickerStudent[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? students.filter((s) => `${s.name} ${s.sub}`.toLowerCase().includes(q)) : students;
  }, [students, query]);

  if (students.length === 0) {
    return <p className="muted">No students are linked to you yet, so there is nobody to pick. Ask the admin to set up your mentees or group.</p>;
  }

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ position: "relative" }}>
        <Search size={16} aria-hidden="true" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }} />
        <input
          type="search"
          className="input"
          style={{ paddingLeft: "2.3rem" }}
          placeholder="Search by name"
          aria-label="Search students"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      </div>
      <ul
        style={{ listStyle: "none", maxHeight: "15rem", overflowY: "auto", border: "1px solid var(--line-strong)", borderRadius: "var(--radius-sm)", background: "var(--surface)" }}
      >
        {shown.length === 0 && <li className="muted" style={{ padding: "0.75rem" }}>No students match.</li>}
        {shown.map((s) => (
          <li key={s.id} style={{ borderBottom: "1px solid var(--line)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", minHeight: 44, padding: "0.4rem 0.75rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={picked.has(s.id)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(s.id);
                  else next.delete(s.id);
                  setPicked(next);
                }}
                style={{ width: 18, height: 18, accentColor: "var(--brand)" }}
              />
              <span>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                {s.sub && <span className="muted"> · {s.sub}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="studentIds" value={id} />
      ))}
      <p className="hint" aria-live="polite">{picked.size === 0 ? "No students picked" : `${picked.size} picked`}</p>
    </div>
  );
}
