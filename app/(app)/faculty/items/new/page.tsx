import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { StudentPicker } from "@/components/StudentPicker";
import { listTargets, listVisibleStudents } from "@/lib/faculty/queries";
import { createItemAction } from "../../form-actions";

export const metadata: Metadata = { title: "New item" };

const TYPES = [
  { id: "hackathon", label: "Hackathon" },
  { id: "internship", label: "Internship" },
  { id: "event", label: "Event" },
  { id: "meeting", label: "Meeting" },
];

function Check({ name, value, label, hint }: { name: string; value?: string; label: string; hint?: string }) {
  return (
    <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", minHeight: 44, padding: "0.4rem 0", cursor: "pointer" }}>
      <input type="checkbox" name={name} value={value} style={{ width: 18, height: 18, marginTop: 3, accentColor: "var(--brand)" }} />
      <span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hint && <span className="hint" style={{ display: "block" }}>{hint}</span>}
      </span>
    </label>
  );
}

export default async function NewItemPage() {
  await connection();
  const [students, { groups, departments }] = await Promise.all([listVisibleStudents(), listTargets()]);
  const pickable = students.filter((s) => s.active).map((s) => ({ id: s.id, name: s.fullName, sub: [s.department, s.year ? `Year ${s.year}` : null].filter(Boolean).join(" · ") }));

  return (
    <>
      <PageHeader title="New item" description="Post something for your students, then choose exactly who it is for." />
      <ActionForm action={createItemAction} submit="Create item" pendingLabel="Creating">
        <section className="panel rise" aria-labelledby="what">
          <h2 id="what" className="panel-title">What is it?</h2>
          <div style={{ display: "grid", gap: "1rem" }}>
            <fieldset style={{ border: 0 }}>
              <legend style={{ fontSize: "var(--step--1)", fontWeight: 650, color: "var(--ink-2)", marginBottom: "0.4rem" }}>Type</legend>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {TYPES.map((t, i) => (
                  <label key={t.id} className="badge badge-neutral" style={{ minHeight: 44, padding: "0 1rem", cursor: "pointer", fontSize: "var(--step-0)" }}>
                    <input type="radio" name="type" value={t.id} required defaultChecked={i === 0} style={{ accentColor: "var(--brand)" }} /> {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" className="input" required autoComplete="off" placeholder="e.g. Smart India Hackathon 2026" />
            </div>
            <div className="field">
              <label htmlFor="description">Details (optional)</label>
              <textarea id="description" name="description" className="input" rows={3} style={{ minHeight: 88, padding: "0.6rem 0.875rem", resize: "vertical" }} />
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="startsAt">Starts (India time, optional)</label>
                <input id="startsAt" name="startsAt" type="datetime-local" className="input" />
              </div>
              <div className="field">
                <label htmlFor="deadline">Reply by (optional)</label>
                <input id="deadline" name="deadline" type="datetime-local" className="input" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="meetingUrl">Meeting link (optional)</label>
              <input id="meetingUrl" name="meetingUrl" type="url" className="input" placeholder="https://meet.google.com/..." autoComplete="off" />
              <span className="hint">Only https links are accepted.</span>
            </div>
          </div>
        </section>

        <section className="panel rise" aria-labelledby="rules">
          <h2 id="rules" className="panel-title">What do you need back?</h2>
          <Check name="requiresConfirmation" label="Results must be confirmed" hint="A result counts only after you or the student's mentor confirms it." />
          <Check name="requiresProof" label="Proof is required" hint="Students must attach a PDF, JPG or PNG up to 5 MB." />
        </section>

        <section className="panel rise" aria-labelledby="who">
          <h2 id="who" className="panel-title">Who is it for?</h2>
          <p className="hint" style={{ marginBottom: "0.75rem" }}>
            Choose any mix. Students are invited once even if they match several choices, and only students you are responsible for are invited.
          </p>
          <div style={{ display: "grid", gap: "1.25rem" }}>
            {groups.length > 0 && (
              <fieldset style={{ border: 0 }}>
                <legend style={{ fontWeight: 650, marginBottom: "0.25rem" }}>Groups</legend>
                {groups.map((g) => <Check key={g.id} name="groupIds" value={g.id} label={g.name} />)}
              </fieldset>
            )}
            {departments.length > 0 && (
              <fieldset style={{ border: 0 }}>
                <legend style={{ fontWeight: 650, marginBottom: "0.25rem" }}>Departments</legend>
                {departments.map((d) => <Check key={d.id} name="departmentIds" value={d.id} label={d.name} />)}
              </fieldset>
            )}
            <fieldset style={{ border: 0 }}>
              <legend style={{ fontWeight: 650, marginBottom: "0.25rem" }}>Year of study</legend>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {[1, 2, 3, 4].map((y) => <Check key={y} name="years" value={String(y)} label={`Year ${y}`} />)}
              </div>
            </fieldset>
            <div>
              <p style={{ fontWeight: 650, marginBottom: "0.4rem" }}>Specific students</p>
              <StudentPicker students={pickable} />
            </div>
          </div>
        </section>
      </ActionForm>
    </>
  );
}
