"use client";
import { useActionState, useRef, useState, startTransition } from "react";
import { AlertCircle, CheckCircle2, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { uploadProof, validateProofFile } from "@/lib/student/upload";
import type { FormAction } from "@/components/ActionForm";

/**
 * Submit a result (or request a correction). Checks the proof file, uploads it to the student's own
 * folder first, and only then sends the form, so a bad file never leaves a half-saved result.
 */
export function ResultForm({
  action,
  mode,
  invitationId,
  resultId,
  requireProof,
  submitLabel,
  defaults,
}: {
  action: FormAction;
  mode: "submit" | "correction";
  invitationId: string;
  resultId?: string;
  requireProof: boolean;
  submitLabel: string;
  defaults?: { outcome: string; details: string | null };
}) {
  const [result, dispatch, pending] = useActionState(action, null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = pending || uploading;
  const id = `${mode}-${resultId ?? invitationId}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = fileRef.current?.files?.[0];
    data.delete("proof");
    try {
      if (file) {
        validateProofFile(file);
        setUploading(true);
        data.set("proofPath", await uploadProof(file, createClient()));
      } else if (requireProof) {
        throw new Error("This event needs a proof file (PDF, JPG or PNG, up to 5 MB).");
      }
    } catch (err) {
      setUploading(false);
      setLocalError(err instanceof Error ? err.message : "The file could not be uploaded.");
      return;
    }
    setUploading(false);
    startTransition(async () => {
      dispatch(data);
    });
  }

  const message = localError ?? (result && !result.ok ? result.message : null);

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.875rem" }}>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="invitationId" value={invitationId} />
      {resultId && <input type="hidden" name="resultId" value={resultId} />}
      <div className="field">
        <label htmlFor={`${id}-outcome`}>Result</label>
        <input id={`${id}-outcome`} name="outcome" className="input" required defaultValue={defaults?.outcome} placeholder="e.g. Won first prize, or Selected for internship" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`${id}-details`}>Details (optional)</label>
        <textarea id={`${id}-details`} name="details" className="input" rows={3} defaultValue={defaults?.details ?? ""} style={{ minHeight: 80, padding: "0.6rem 0.875rem", resize: "vertical" }} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-proof`}>
          Proof {requireProof ? "(required)" : "(optional)"}
        </label>
        <input id={`${id}-proof`} ref={fileRef} name="proof" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" className="input" style={{ paddingTop: 10 }} />
        <span className="hint">PDF, JPG or PNG, up to 5 MB. Only you and the people who review your results can open it.</span>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Paperclip size={18} aria-hidden="true" />}
          {uploading ? "Uploading file" : pending ? "Saving" : submitLabel}
        </button>
        {message && (
          <p role="alert" className="error-text" style={{ margin: 0 }}>
            <AlertCircle size={16} aria-hidden="true" /> {message}
          </p>
        )}
        {result?.ok && !message && (
          <p role="status" style={{ display: "flex", gap: "0.4rem", alignItems: "center", color: "var(--seal)", fontWeight: 600 }}>
            <CheckCircle2 size={16} aria-hidden="true" /> {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
