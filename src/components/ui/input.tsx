import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "border-border bg-card placeholder:text-muted-foreground focus-visible:ring-foreground/15 focus-visible:border-foreground/30 h-11 w-full rounded-md border px-3.5 text-sm transition-shadow outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
}
