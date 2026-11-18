import Link from "next/link";
import styles from "./StudentHero.module.css";

export type RingKind = "sealed" | "claimed";

const R = 90;
const C = 118;
const GAP = 0.09;

function arcPath(i: number, n: number): string {
  const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n > 1 ? GAP / 2 : 0.02);
  const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n - (n > 1 ? GAP / 2 : 0.02);
  const p = (a: number) => `${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}`;
  return `M${p(a0)} A${R} ${R} 0 ${n === 1 ? 1 : 0} 1 ${p(a1)}`;
}

/**
 * Student home hero: one ring segment per record (solid sky blue once confirmed, dashed yellow while it waits).
 * Hovering or focusing a record card below lights its segment (CSS :has, no client code).
 */
export function StudentHero({
  name,
  kinds,
  toReply,
  toFix,
  children,
}: {
  name: string;
  kinds: RingKind[];
  toReply: number;
  toFix: number;
  children?: React.ReactNode;
}) {
  const confirmed = kinds.filter((k) => k === "sealed").length;
  const waiting = kinds.length - confirmed;
  const first = name.trim().split(/\s+/)[0] || "there";
  const hoverCss = kinds
    .map((_, i) => `.${styles.scope}:has([data-ring="${i}"]:is(:hover,:focus-within)) [data-arc="${i}"]{stroke:#fff;stroke-width:21}`)
    .join("\n");
  const steps: string[] = [];
  if (toReply > 0) steps.push(`${toReply} ${toReply === 1 ? "invitation is" : "invitations are"} waiting for your reply`);
  if (toFix > 0) steps.push(`${toFix} ${toFix === 1 ? "result was" : "results were"} sent back to fix`);

  return (
    <div className={styles.scope}>
      <style>{hoverCss}</style>
      <section className={styles.hero} aria-label="Your record at a glance">
        <div className={styles.ring} role="img" aria-label={`${kinds.length} records: ${confirmed} confirmed, ${waiting} awaiting confirmation`}>
          <svg viewBox="0 0 236 236" aria-hidden="true">
            <circle className={styles.teeth} cx="118" cy="118" r="112" />
            {kinds.map((k, i) => (
              <path key={i} data-arc={i} className={k === "sealed" ? styles.arcOk : styles.arcClaim} d={arcPath(i, kinds.length)} />
            ))}
          </svg>
          <div className={styles.big}>
            <b>{confirmed}</b>
            <span>confirmed</span>
          </div>
        </div>
        <div className={styles.copy}>
          <div className={styles.ribbons}>
            {waiting > 0 && (
              <span className={`${styles.ribbon} ${styles.ribbonRed}`}><span>{waiting} awaiting</span></span>
            )}
          </div>
          <h1 className={styles.hello}>Hello, {first}</h1>
          <p>
            Every record you add gets its own segment of the ring: solid once it is confirmed, dashed while it waits. Point at a record below to find its segment.
          </p>
        </div>
      </section>

      {steps.length > 0 && (
        <div className={styles.next} role="status">
          <b>Next step</b>
          <span>{steps.join(", and ")}.</span>
          <div className={styles.acts}>
            {toReply > 0 && <Link href="#reply" className="btn btn-primary">Reply now</Link>}
            {toFix > 0 && <Link href="#joined" className="btn btn-primary">Fix results</Link>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
