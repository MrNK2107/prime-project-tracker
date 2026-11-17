import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { loadAdminData } from "@/lib/admin/queries";
import { promoteYearAction } from "../form-actions";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = { title: "Year promotion" };

export default async function YearsPage() {
  await connection();
  const { departments, people } = await loadAdminData();
  const withYear = people.filter((p) => p.role === "student" && p.active && p.year);

  return (
    <>
      <PageHeader title="Year promotion" description="At the start of the year, move students up one year of study." />

      {departments.length === 0 ? (
        <EmptyState icon={<GraduationCap size={22} />} title="No departments yet">Create departments and place students in them before promoting a year.</EmptyState>
      ) : (
        <section className="panel rise" aria-labelledby="promote">
          <h2 id="promote" className="panel-title">Move students up a year</h2>
          <p style={{ marginBottom: "1rem", color: "var(--ink-2)" }}>
            Only active students who already have a year are moved, and nobody goes past Year 6. Promoting is not undone automatically: set a student&apos;s year by hand on the Links page to correct a mistake.
          </p>
          <ActionForm
            action={promoteYearAction}
            submit="Promote"
            pendingLabel="Promoting"
            confirm="Move these students up one year? This changes their year of study."
          >
            <div className="field" style={{ maxWidth: "26rem" }}>
              <label htmlFor="promote-dept">Who to promote</label>
              <select id="promote-dept" name="departmentId" className="select" defaultValue="">
                <option value="">All departments ({withYear.length} students)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
