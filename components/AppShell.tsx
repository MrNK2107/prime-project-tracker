import { LogOut } from "lucide-react";
import { SealMark } from "@/components/SealMark";
import { NavLinks } from "@/components/NavLinks";
import { signOut } from "@/app/(app)/actions";
import { NAV, ROLE_LABEL } from "@/lib/nav";
import type { SessionProfile } from "@/lib/session";
import styles from "./AppShell.module.css";

export function AppShell({ profile, isHod = false, children }: { profile: SessionProfile; isHod?: boolean; children: React.ReactNode }) {
  const base = NAV[profile.role];
  const all = isHod ? [...base, { href: "/faculty/department", label: "Department", icon: "chart" as const }] : base;
  const items = all.map((i) => ({ href: i.href, label: i.label, iconName: i.icon }));
  const initial = (profile.fullName || ROLE_LABEL[profile.role]).trim().charAt(0).toUpperCase();

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>Skip to content</a>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <div className={styles.brand}>
            <SealMark size={30} />
            <div className={styles.brandText}>
              <span className={styles.product}>Prime Project Tracker</span>
              <span className={styles.college}>Saveetha Engineering College</span>
            </div>
          </div>

          <NavLinks items={items} variant="top" />

          <div className={styles.user}>
            <div className={styles.who}>
              <span className={styles.name}>{profile.fullName || "Signed in"}</span>
              <span className={styles.role}>{ROLE_LABEL[profile.role]}</span>
            </div>
            <span className={styles.avatar} aria-hidden="true">{initial}</span>
            <form action={signOut}>
              <button type="submit" className={styles.signout} aria-label="Sign out">
                <LogOut size={18} aria-hidden="true" />
                <span className={styles.signoutLabel}>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className={styles.main}>
        {children}
      </main>

      <NavLinks items={items} variant="bottom" />
    </div>
  );
}
