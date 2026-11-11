import Link from "next/link";
import { Lock } from "lucide-react";

/** Corner badge on a design that needs PRO. */
export function ProLockBadge() {
  return (
    <span className="pointer-events-none absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-[#1d1d1f]/90 px-2 py-1 text-[10px] font-semibold tracking-[.08em] text-white shadow-sm backdrop-blur">
      <Lock aria-hidden className="size-3" strokeWidth={2.4} />
      PRO
    </span>
  );
}

/** "See PRO plans" link shown after a save/publish refused for a PRO design. */
export function ProPlansLink({ from }: { from: "cards" | "website" }) {
  return (
    <Link
      href={`/pricing?from=${from}`}
      className="ml-1 font-medium underline underline-offset-4"
    >
      See PRO plans
    </Link>
  );
}
