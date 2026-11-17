"use server";
import { revalidatePath } from "next/cache";
import { createItem, reviewResult, ITEM_TYPES, type ItemType } from "@/lib/faculty/actions";
import type { FormResult } from "@/components/ActionForm";

const s = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const all = (d: FormData, k: string) => d.getAll(k).map((v) => String(v)).filter(Boolean);

async function run(fn: () => Promise<string>): Promise<FormResult> {
  try {
    const message = await fn();
    revalidatePath("/faculty", "layout");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function createItemAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    const type = s(d, "type") as ItemType;
    if (!ITEM_TYPES.includes(type)) throw new Error("Choose what kind of item this is.");
    await createItem({
      type,
      title: s(d, "title"),
      description: s(d, "description"),
      meetingUrl: s(d, "meetingUrl"),
      startsAt: s(d, "startsAt"),
      deadline: s(d, "deadline"),
      requiresConfirmation: d.get("requiresConfirmation") === "on",
      requiresProof: d.get("requiresProof") === "on",
      groupIds: all(d, "groupIds"),
      departmentIds: all(d, "departmentIds"),
      years: all(d, "years").map(Number).filter((n) => Number.isInteger(n)),
      studentIds: all(d, "studentIds"),
    });
    return "Item created. The students you chose can now see it.";
  });
}

export async function reviewAction(_p: FormResult, d: FormData): Promise<FormResult> {
  return run(async () => {
    const decision = s(d, "decision");
    if (decision !== "confirm" && decision !== "send_back") throw new Error("Choose confirm or send back.");
    await reviewResult(s(d, "resultId"), decision, s(d, "note"));
    return decision === "confirm" ? "Result confirmed." : "Sent back to the student.";
  });
}
