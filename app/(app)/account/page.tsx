import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "Change password" };

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Change password" description="Choose a password only you know. Use at least 8 characters." />
      <section className="panel rise" aria-labelledby="pw">
        <h2 id="pw" className="panel-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <KeyRound size={20} aria-hidden="true" /> Your password
        </h2>
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
