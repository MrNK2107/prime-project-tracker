"use client";
import { useState } from "react";
import { FileText, AlertCircle } from "lucide-react";

/** Opens a result's proof in a new tab through the audited route (a 60-second signed link). */
export function ProofButton({ resultId }: { resultId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function open() {
    setState("loading");
    // Open the tab synchronously so the browser does not block it as a popup.
    const tab = window.open("", "_blank");
    try {
      const res = await fetch(`/api/proof/${resultId}`, { cache: "no-store" });
      const body = (await res.json()) as { url?: string };
      if (!res.ok || !body.url) throw new Error("failed");
      if (tab) {
        tab.opener = null;
        tab.location.href = body.url;
      }
      setState("idle");
    } catch {
      tab?.close();
      setState("error");
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-secondary" style={{ minHeight: 40 }} onClick={open} disabled={state === "loading"}>
        {state === "loading" ? <span className="spinner" aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
        View proof
      </button>
      {state === "error" && (
        <span role="alert" className="error-text" style={{ padding: "0.3rem 0.6rem" }}>
          <AlertCircle size={14} aria-hidden="true" /> Could not open the proof. Try again.
        </span>
      )}
    </span>
  );
}
