import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AppShell } from "@/components/AppShell";
import { ShellSkeleton } from "@/components/ShellSkeleton";
import { getSessionProfile } from "@/lib/session";

async function AuthedShell({ children }: { children: React.ReactNode }) {
  await connection(); // the session is per-request data, never prerendered
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return <AppShell profile={profile}>{children}</AppShell>;
}

/**
 * Every signed-in screen shares this shell. A missing or deactivated profile goes back to sign-in.
 * The session read is request-time data, so it sits behind Suspense with a matching skeleton.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}
