import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Building2, UsersRound } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { loadAdminData, type Person } from "@/lib/admin/queries";
import {
  assignMentorAction,
  addToGroupAction,
  removeFromGroupAction,
  assignGroupLeadAction,
  removeGroupLeadAction,
  assignHodAction,
  moveDepartmentAction,
  setYearAction,
  createDepartmentAction,
  createGroupAction,
  assignPlacementAction,
  removePlacementAction,
} from "../form-actions";

export const metadata: Metadata = { title: "Links" };

const TABS = [
  { id: "mentors", label: "Mentors" },
  { id: "groups", label: "Groups" },
  { id: "departments", label: "Departments" },
  { id: "placement", label: "Placement" },
] as const;

function Options({ people, placeholder }: { people: Person[]; placeholder: string }) {
  return (
    <>
      <option value="" disabled>{placeholder}</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.fullName || p.email}</option>
      ))}
    </>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export default async function LinksPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection();
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.id === rawTab) ? (rawTab as (typeof TABS)[number]["id"]) : "mentors";
  const { people, departments, groups, placement } = await loadAdminData();

  const students = people.filter((p) => p.role === "student" && p.active);
  const faculty = people.filter((p) => p.role === "faculty" && p.active);

  return (
    <>
      <PageHeader title="Links" description="Who mentors, leads and heads whom. Changing a link ends the old one and keeps its history." />

      <nav className="tabs" aria-label="Link types">
        {TABS.map((t) => (
          <Link key={t.id} href={`/admin/links?tab=${t.id}`} className="tab" aria-current={t.id === tab ? "page" : undefined} scroll={false}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "mentors" && (
        <div className="stack">
          <section className="panel rise" aria-labelledby="assign-mentor">
            <h2 id="assign-mentor" className="panel-title">Assign a mentor</h2>
            <ActionForm action={assignMentorAction} submit="Save mentor">
              <div className="form-row">
                <Field id="m-student" label="Student">
                  <select id="m-student" name="studentId" className="select" required defaultValue="">
                    <Options people={students} placeholder="Choose a student" />
                  </select>
                </Field>
                <Field id="m-mentor" label="Mentor">
                  <select id="m-mentor" name="mentorId" className="select" required defaultValue="">
                    <Options people={faculty} placeholder="Choose a faculty member" />
                  </select>
                </Field>
              </div>
            </ActionForm>
            <p className="hint" style={{ marginTop: "0.75rem" }}>A student has one mentor at a time. Choosing a new one ends the current mentorship today.</p>
          </section>

          {students.length === 0 ? (
            <EmptyState icon={<UsersRound size={22} />} title="No students yet">Create student accounts first, then assign their mentors here.</EmptyState>
          ) : (
            <div className="table-wrap rise">
              <table className="table">
                <thead>
                  <tr><th scope="col">Student</th><th scope="col">Mentor</th></tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td><div className="primary">{s.fullName || s.email}</div><div className="secondary">{s.email}</div></td>
                      <td data-label="Mentor">{s.mentor ? s.mentor.name : <span className="badge badge-claim">No mentor</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "groups" && (
        <div className="stack">
          <section className="panel rise" aria-labelledby="new-group">
            <h2 id="new-group" className="panel-title">New group</h2>
            <ActionForm action={createGroupAction} submit="Create group" pendingLabel="Creating">
              <Field id="group-name" label="Group name">
                <input id="group-name" name="name" className="input" required placeholder="e.g. Prime Project" autoComplete="off" />
              </Field>
            </ActionForm>
          </section>

          {groups.length === 0 && <EmptyState icon={<UsersRound size={22} />} title="No groups yet">Create a group above, then add its members and leads.</EmptyState>}

          {groups.map((g) => (
            <section key={g.id} className="panel rise" aria-labelledby={`g-${g.id}`}>
              <h2 id={`g-${g.id}`} className="panel-title">{g.name}</h2>

              <h3 style={{ fontSize: "var(--step-0)", margin: "0.5rem 0" }}>Leads</h3>
              {g.leads.length === 0 ? <p className="muted">No lead yet.</p> : (
                <ul style={{ listStyle: "none", display: "grid", gap: "0.5rem" }}>
                  {g.leads.map((l) => (
                    <li key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                      <span className="primary" style={{ fontWeight: 650 }}>{l.name} {l.coordinator && <span className="badge badge-seal" style={{ marginLeft: "0.4rem" }}>Coordinator</span>}</span>
                      <ActionForm action={removeGroupLeadAction} submit="Remove" variant="ghost" compact confirm={`Remove ${l.name} as lead of ${g.name}?`}>
                        <input type="hidden" name="groupId" value={g.id} />
                        <input type="hidden" name="facultyId" value={l.id} />
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: "0.75rem" }}>
                <ActionForm action={assignGroupLeadAction} submit="Add lead" variant="secondary">
                  <input type="hidden" name="groupId" value={g.id} />
                  <Field id={`lead-${g.id}`} label="Faculty member">
                    <select id={`lead-${g.id}`} name="facultyId" className="select" required defaultValue="">
                      <Options people={faculty} placeholder="Choose a faculty member" />
                    </select>
                  </Field>
                  <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", minHeight: 44, cursor: "pointer" }}>
                    <input type="checkbox" name="coordinator" style={{ width: 18, height: 18, marginTop: 3, accentColor: "var(--brand)" }} />
                    <span><span style={{ fontWeight: 600 }}>Coordinator</span><span className="hint" style={{ display: "block" }}>Can confirm any result in this group and edit any event that reaches it.</span></span>
                  </label>
                </ActionForm>
              </div>

              <hr className="perforation" style={{ margin: "1.25rem 0" }} />

              <h3 style={{ fontSize: "var(--step-0)", margin: "0.5rem 0" }}>Members <span className="muted" style={{ fontWeight: 500 }}>({g.members.length})</span></h3>
              {g.members.length === 0 ? <p className="muted">No members yet.</p> : (
                <ul style={{ listStyle: "none", display: "grid", gap: "0.5rem" }}>
                  {g.members.map((m) => (
                    <li key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                      <span>{m.name}</span>
                      <ActionForm action={removeFromGroupAction} submit="Remove" variant="ghost" compact confirm={`Remove ${m.name} from ${g.name}?`}>
                        <input type="hidden" name="groupId" value={g.id} />
                        <input type="hidden" name="studentId" value={m.id} />
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: "0.75rem" }}>
                <ActionForm action={addToGroupAction} submit="Add student" variant="secondary">
                  <input type="hidden" name="groupId" value={g.id} />
                  <Field id={`member-${g.id}`} label="Student">
                    <select id={`member-${g.id}`} name="studentId" className="select" required defaultValue="">
                      <Options people={students.filter((s) => !g.members.some((m) => m.id === s.id))} placeholder="Choose a student" />
                    </select>
                  </Field>
                </ActionForm>
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "placement" && (
        <section className="panel rise" aria-labelledby="placement-title">
          <h2 id="placement-title" className="panel-title">Hackathon and placement coordinators</h2>
          <p className="hint" style={{ marginBottom: "0.75rem" }}>
            A coordinator sees every student, can post events to anyone and tracks progress across the college. Confirming a result or editing someone else&apos;s event still needs another link (mentor, creator, or group coordinator).
          </p>
          {placement.length === 0 ? <p className="muted">No one holds this role yet.</p> : (
            <ul style={{ listStyle: "none", display: "grid", gap: "0.5rem", marginBottom: "1rem" }}>
              {placement.map((p) => (
                <li key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 650 }}>{p.name}</span>
                  <ActionForm action={removePlacementAction} submit="End role" variant="ghost" compact confirm={`End ${p.name}'s role as hackathon and placement coordinator?`}>
                    <input type="hidden" name="facultyId" value={p.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={assignPlacementAction} submit="Give the role" variant="secondary">
            <Field id="placement-faculty" label="Faculty member">
              <select id="placement-faculty" name="facultyId" className="select" required defaultValue="">
                <Options people={faculty} placeholder="Choose a faculty member" />
              </select>
            </Field>
          </ActionForm>
        </section>
      )}

      {tab === "departments" && (
        <div className="stack">
          <section className="panel rise" aria-labelledby="new-dept">
            <h2 id="new-dept" className="panel-title">New department</h2>
            <ActionForm action={createDepartmentAction} submit="Create department" pendingLabel="Creating">
              <Field id="dept-name" label="Department name">
                <input id="dept-name" name="name" className="input" required placeholder="e.g. Computer Science and Engineering" autoComplete="off" />
              </Field>
            </ActionForm>
          </section>

          {departments.length === 0 ? (
            <EmptyState icon={<Building2 size={22} />} title="No departments yet">Create a department above, then name its head and place students in it.</EmptyState>
          ) : (
            <>
              <section className="panel rise" aria-labelledby="hod-title">
                <h2 id="hod-title" className="panel-title">Head of department</h2>
                <ActionForm action={assignHodAction} submit="Save head of department">
                  <div className="form-row">
                    <Field id="hod-dept" label="Department">
                      <select id="hod-dept" name="departmentId" className="select" required defaultValue="">
                        <option value="" disabled>Choose a department</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </Field>
                    <Field id="hod-faculty" label="Faculty member">
                      <select id="hod-faculty" name="facultyId" className="select" required defaultValue="">
                        <Options people={faculty} placeholder="Choose a faculty member" />
                      </select>
                    </Field>
                  </div>
                </ActionForm>
              </section>

              <section className="panel rise" aria-labelledby="place-title">
                <h2 id="place-title" className="panel-title">Place a student</h2>
                <div className="stack">
                  <ActionForm action={moveDepartmentAction} submit="Save department">
                    <div className="form-row">
                      <Field id="place-student" label="Student">
                        <select id="place-student" name="studentId" className="select" required defaultValue="">
                          <Options people={students} placeholder="Choose a student" />
                        </select>
                      </Field>
                      <Field id="place-dept" label="Department">
                        <select id="place-dept" name="departmentId" className="select" required defaultValue="">
                          <option value="" disabled>Choose a department</option>
                          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </Field>
                    </div>
                  </ActionForm>
                  <ActionForm action={setYearAction} submit="Save year" variant="secondary">
                    <div className="form-row">
                      <Field id="year-student" label="Student">
                        <select id="year-student" name="studentId" className="select" required defaultValue="">
                          <Options people={students} placeholder="Choose a student" />
                        </select>
                      </Field>
                      <Field id="year-value" label="Year of study">
                        <select id="year-value" name="year" className="select" required defaultValue="">
                          <option value="" disabled>Choose a year</option>
                          {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
                        </select>
                      </Field>
                    </div>
                  </ActionForm>
                </div>
              </section>

              <div className="table-wrap rise">
                <table className="table">
                  <thead>
                    <tr><th scope="col">Department</th><th scope="col">Head</th><th scope="col">Students</th></tr>
                  </thead>
                  <tbody>
                    {departments.map((d) => (
                      <tr key={d.id}>
                        <td className="primary">{d.name}</td>
                        <td data-label="Head">{d.hod ? d.hod.name : <span className="badge badge-claim">No head</span>}</td>
                        <td data-label="Students">{d.students}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
