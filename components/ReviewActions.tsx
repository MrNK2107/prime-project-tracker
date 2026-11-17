"use client";
import { useActionState, startTransition } from "react";
import { AlertCircle, Check, Undo2 } from "lucide-react";
import type { FormResult } from "@/components/ActionForm";

/** Confirm or send back one result. A note is required to send back (the student sees it). */
export function ReviewActions({
  action,
  resultId,
}: {
  action: (prev: FormResult, data: FormData) => Promise<FormResult>;
  resultId: string;
}) {
  const [result, dispatch, pending] = useActionState(action, null);
  const noteId = `note-${resultId}`;

  return (
    <form
      style={{ display: "grid", gap: "0.75rem" }}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const data = new FormData(e.currentTarget, submitter);
        startTransition(async () => {
          dispatch(data);
        });
      }}
    >
      <input type="hidden" name="resultId" value={resultId} />
      <div className="field">
        <label htmlFor={noteId}>Note for the student (needed to send back)</label>
        <textarea id={noteId} name="note" className="input" rows={2} style={{ minHeight: 64, padding: "0.6rem 0.875rem", resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" name="decision" value="confirm" className="btn btn-primary" disabled={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
          Confirm result
        </button>
        <button type="submit" name="decision" value="send_back" className="btn btn-secondary" disabled={pending}>
          <Undo2 size={18} aria-hidden="true" /> Send back
        </button>
        {result && !result.ok && (
          <p role="alert" className="error-text" style={{ margin: 0 }}>
            <AlertCircle size={16} aria-hidden="true" /> {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
