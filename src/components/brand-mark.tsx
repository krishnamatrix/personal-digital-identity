/** Folioone wordmark: a white disc with a dark dot, like the reference chrome's favicon. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className="bg-card flex size-8 items-center justify-center rounded-full shadow-[0_1px_2px_rgba(0,0,0,.08)] ring-1 ring-black/5"
      >
        <span className="bg-foreground size-2.5 rounded-full" />
      </span>
      <span className="font-display text-[17px]">Folioone</span>
    </span>
  );
}
