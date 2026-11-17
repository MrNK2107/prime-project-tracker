import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { UsersRound } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { listVisibleStudents } from "@/lib/faculty/queries";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage() {
  await connection();
  const students = await listVisibleStudents();

  return (
    <>
      <PageHeader title="Students" description="The students you are responsible for as a mentor, group lead or head of department." />
      {students.length === 0 ? (
        <EmptyState icon={<UsersRound size={22} />} title="No students linked to you yet">
          Students appear here once the admin makes you their mentor, a group lead or a head of department.
        </EmptyState>
      ) : (
        <div className="table-wrap rise">
          <table className="table">
            <thead>
              <tr><th scope="col">Student</th><th scope="col">Department</th><th scope="col">Year</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="primary"><Link href={`/faculty/students/${s.id}`}>{s.fullName}</Link></div>
                    <div className="secondary">{s.email}</div>
                  </td>
                  <td data-label="Department">{s.department ?? <span className="muted">None</span>}</td>
                  <td data-label="Year">{s.year ?? <span className="muted">-</span>}</td>
                  <td data-label="Status"><span className={`badge ${s.active ? "badge-seal" : "badge-off"}`}>{s.active ? "Active" : "Deactivated"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
