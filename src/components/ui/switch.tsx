import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible on/off control. A native checkbox with role="switch", so keyboard
 * (Space), form semantics and screen-reader state come from the platform. Always
 * pair with a visible or aria-label name.
 */
export function Switch({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role">) {
  return (
    <input
      type="checkbox"
      role="switch"
      className={cn(
        "border-border bg-muted checked:bg-accent checked:border-accent focus-visible:ring-accent relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        "before:absolute before:top-0.5 before:left-0.5 before:size-3.5 before:rounded-full before:bg-white before:shadow-sm before:transition-transform before:content-[''] checked:before:translate-x-4",
        className,
      )}
      {...props}
    />
  );
}
