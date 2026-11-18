import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { KeyRound, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/session";
import { getMyScope } from "@/lib/faculty/scope";
import { ROLE_LABEL } from "@/lib/nav";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  await connection();
  const me = await getSessionProfile();
  if (!me) redirect("/login");
  const supabase = await createServerClient();
  const [{ data: row }, scope] = await Promise.all([
    supabase.from("profiles").select("email, register_no").eq("id", me.id).maybeSingle(),
    me.role === "faculty" ? getMyScope() : Promise.resolve(null),
  ]);
  const isStudent = me.role === "student";

  const roles: string[] = [];
  if (scope) {
    if (scope.mentees.length) roles.push(`Mentor of ${scope.mentees.length} student${scope.mentees.length === 1 ? "" : "s"}`);
    for (const g of scope.groups) roles.push(`${g.coordinator ? "Coordinator" : "Lead"} of ${g.name}`);
    for (const d of scope.departments) roles.push(`Head of ${d.name}`);
    if (scope.placement) roles.push("Hackathon and placement coordinator");
  }

  const facts: [string, string][] = [
    ["Name", me.fullName || "-"],
    ["Role", ROLE_LABEL[me.role]],
    isStudent ? ["Register number", String(row?.register_no ?? "-")] : ["Email", String(row?.email ?? "-")],
  ];

  return (
    <>
      <PageHeader title="Profile" description="Your details, and your password." />
      <section className="panel rise" aria-labelledby="who">
        <h2 id="who" className="panel-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <UserRound size={20} aria-hidden="true" /> You
        </h2>
        <dl style={{ display: "grid", gap: "0.75rem 2rem", gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))" }}>
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="hint">{k}</dt>
              <dd style={{ fontWeight: 650 }}>{v}</dd>
            </div>
          ))}
        </dl>
        {roles.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <p className="hint" style={{ marginBottom: "0.35rem" }}>What you are responsible for</p>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {roles.map((r) => <span key={r} className="badge badge-neutral">{r}</span>)}
            </div>
          </div>
        )}
      </section>

      <section className="panel rise" aria-labelledby="pw" style={{ marginTop: "1.25rem" }}>
        <h2 id="pw" className="panel-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <KeyRound size={20} aria-hidden="true" /> Change password
        </h2>
        <p className="hint" style={{ marginBottom: "0.75rem" }}>Choose a password only you know. Use at least 8 characters.</p>
        <ActionForm action={changePasswordAction} submit="Change password" pendingLabel="Saving">
          <div className="form-row">
            <div className="field">
              <label htmlFor="current">Current password</label>
              <input id="current" name="current" type="password" className="input" required autoComplete="current-password" maxLength={72} />
            </div>
            <div className="field">
              <label htmlFor="next">New password</label>
              <input id="next" name="next" type="password" className="input" required minLength={8} maxLength={72} autoComplete="new-password" />
            </div>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
