"use server";
import { revalidatePath } from "next/cache";
import { respond, submitResult, requestCorrection } from "@/lib/student/actions";
import type { FormResult } from "@/components/ActionForm";

const s = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

async function run(fn: () => Promise<string>): Promise<FormResult> {
  try {
    const message = await fn();
    revalidatePath("/student", "layout");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function respondAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    const status = s(d, "status");
    if (status !== "joined" && status !== "declined") throw new Error("Choose join or decline.");
    await respond(s(d, "invitationId"), status);
    return status === "joined" ? "You joined this." : "You declined this.";
  });
}

export async function submitResultAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    const mode = s(d, "mode");
    const proof = s(d, "proofPath") || null;
    if (mode === "correction") {
      await requestCorrection(s(d, "resultId"), s(d, "outcome"), s(d, "details"), proof);
      return "Correction sent for review. Your confirmed result stays in place until it is confirmed.";
    }
    await submitResult(s(d, "invitationId"), s(d, "outcome"), s(d, "details"), proof);
    return "Result submitted.";
  });
}
