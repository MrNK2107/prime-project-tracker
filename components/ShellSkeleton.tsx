import { SealMark } from "@/components/SealMark";
import styles from "./AppShell.module.css";

/** Shown while the session loads: the real top bar's shape, so nothing jumps when it arrives. */
export function ShellSkeleton() {
  return (
    <div className={styles.shell} aria-busy="true">
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <div className={styles.brand}>
            <SealMark size={30} />
            <div className={styles.brandText}>
              <span className={styles.product}>Prime Project Tracker</span>
              <span className={styles.college}>Saveetha Engineering College</span>
            </div>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <span className="visually-hidden" role="status">Loading</span>
      </main>
    </div>
  );
}
