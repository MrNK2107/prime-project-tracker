import type { Metadata } from "next";
import { connection } from "next/server";
import { UserPlus, Users } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { loadAdminData, type Person } from "@/lib/admin/queries";
import { createUserAction, setActiveAction } from "./form-actions";

export const metadata: Metadata = { title: "Accounts" };

const ROLE: Record<Person["role"], string> = { student: "Student", faculty: "Faculty", admin: "Admin", principal: "Principal" };

export default async function AccountsPage() {
  await connection();
  const { people } = await loadAdminData();

  return (
    <>
      <PageHeader title="Accounts" description="Create sign-in accounts for students and faculty, and turn them off when someone leaves." />

      <section className="panel rise" aria-labelledby="new-account">
        <h2 id="new-account" className="panel-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <UserPlus size={20} aria-hidden="true" /> New account
        </h2>
        <ActionForm action={createUserAction} submit="Create account" pendingLabel="Creating">
          <div className="form-row">
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" name="fullName" className="input" required autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="email">College email</label>
              <input id="email" name="email" type="email" className="input" required autoComplete="off" inputMode="email" />
            </div>
            <div className="field">
              <label htmlFor="role">Role</label>
              <select id="role" name="role" className="select" defaultValue="student">
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
              </select>
            </div>
          </div>
        </ActionForm>
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          Admin and principal accounts are set up outside the app. After creating a student, set their department, year and mentor on the Links page.
        </p>
      </section>

      <h2 style={{ margin: "2rem 0 0.75rem" }}>
        All accounts <span className="muted" style={{ fontWeight: 500 }}>({people.length})</span>
      </h2>

      {people.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="No accounts yet">Create the first one above.</EmptyState>
      ) : (
        <div className="table-wrap rise">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Role</th>
                <th scope="col">Placement</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="primary">{p.fullName || "No name"}</div>
                    <div className="secondary">{p.email}</div>
                  </td>
                  <td data-label="Role">{ROLE[p.role]}</td>
                  <td data-label="Placement">
                    {p.role === "student" ? (
                      <span>
                        {p.department?.name ?? <span className="muted">No department</span>}
                        {p.year ? ` · Year ${p.year}` : ""}
                        <br />
                        <span className="secondary">{p.mentor ? `Mentor: ${p.mentor.name}` : "No mentor"}</span>
                      </span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <span className={`badge ${p.active ? "badge-seal" : "badge-off"}`}>{p.active ? "Active" : "Deactivated"}</span>
                  </td>
                  <td>
                    {p.role === "student" || p.role === "faculty" ? (
                      <ActionForm
                        action={setActiveAction}
                        submit={p.active ? "Deactivate" : "Reactivate"}
                        pendingLabel="Saving"
                        variant="secondary"
                        compact
                        confirm={p.active ? `Deactivate ${p.fullName || p.email}? They will be signed out and lose access immediately.` : undefined}
                      >
                        <input type="hidden" name="userId" value={p.id} />
                        <input type="hidden" name="active" value={String(!p.active)} />
                      </ActionForm>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
