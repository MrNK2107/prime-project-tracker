import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { getEventTracking } from "@/lib/faculty/tracking";
import { canEditEvent } from "@/lib/faculty/permissions";
import { getMyScope } from "@/lib/faculty/scope";
import { isoToIstInput } from "@/lib/time";
import { updateEventAction } from "../../../form-actions";

export const metadata: Metadata = { title: "Edit event" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [event, scope] = await Promise.all([getEventTracking(id), getMyScope()]);
  if (!event || !canEditEvent(event, scope)) notFound();

  return (
    <>
      <Link href={`/faculty/events/${id}`} className="btn btn-ghost" style={{ marginBottom: "0.75rem", marginLeft: "-0.5rem" }}>
        <ArrowLeft size={18} aria-hidden="true" /> Back to the event
      </Link>
      <PageHeader title="Edit event" description="Change the wording and dates. Who is invited and what the event asks for stay as they were posted." />
      <ActionForm action={updateEventAction} submit="Save changes" pendingLabel="Saving">
        <input type="hidden" name="eventId" value={id} />
        <section className="panel rise" style={{ display: "grid", gap: "1rem" }}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" className="input" required autoComplete="off" defaultValue={event.title} />
          </div>
          <div className="field">
            <label htmlFor="description">Details (optional)</label>
            <textarea id="description" name="description" className="input" rows={3} style={{ minHeight: 88, padding: "0.6rem 0.875rem", resize: "vertical" }} defaultValue={event.description ?? ""} />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="startsAt">Starts (India time, optional)</label>
              <input id="startsAt" name="startsAt" type="datetime-local" className="input" defaultValue={isoToIstInput(event.startsAt)} />
            </div>
            <div className="field">
              <label htmlFor="deadline">Reply by (optional)</label>
              <input id="deadline" name="deadline" type="datetime-local" className="input" defaultValue={isoToIstInput(event.deadline)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="meetingUrl">Meeting link (optional)</label>
            <input id="meetingUrl" name="meetingUrl" type="url" className="input" autoComplete="off" defaultValue={event.meetingUrl ?? ""} />
            <span className="hint">Only https links are accepted.</span>
          </div>
        </section>
      </ActionForm>
    </>
  );
}
