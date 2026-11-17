"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, ListChecks, Plus, ClipboardCheck, Users, Link2, BarChart3 } from "lucide-react";
import styles from "./AppShell.module.css";

const ICONS = { inbox: Inbox, list: ListChecks, plus: Plus, review: ClipboardCheck, users: Users, link: Link2, chart: BarChart3, check: ClipboardCheck };

export type NavLinkItem = { href: string; label: string; iconName: keyof typeof ICONS };

/** One nav list, rendered twice: tabs in the top bar on wide screens, a bottom bar on phones. */
export function NavLinks({ items, variant }: { items: NavLinkItem[]; variant: "top" | "bottom" }) {
  const pathname = usePathname();
  return (
    <nav className={variant === "top" ? styles.topNav : styles.bottomNav} aria-label={variant === "top" ? "Main" : "Main (mobile)"}>
      <ul>
        {items.map((item) => {
          const Icon = ICONS[item.iconName];
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={styles.navLink}>
                <Icon size={variant === "bottom" ? 22 : 18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
