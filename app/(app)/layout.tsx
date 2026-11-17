import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AppShell } from "@/components/AppShell";
import { ShellSkeleton } from "@/components/ShellSkeleton";
import { getSessionProfile } from "@/lib/session";
import { myDepartments } from "@/lib/dashboards/queries";

async function AuthedShell({ children }: { children: React.ReactNode }) {
  await connection(); // the session is per-request data, never prerendered
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  // A faculty member who currently heads a department also gets the Department dashboard.
  const isHod = profile.role === "faculty" && (await myDepartments()).length > 0;
  return <AppShell profile={profile} isHod={isHod}>{children}</AppShell>;
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
