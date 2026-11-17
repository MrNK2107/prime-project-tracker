/** The product mark: an embossed seal ring with a check. Authored SVG, no external asset. */
export function SealMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
    >
      <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 2.2" />
      <path d="M10.5 16.4l3.9 3.9 7.1-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
