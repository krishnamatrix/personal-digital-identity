import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "border-border bg-card placeholder:text-muted-foreground focus-visible:ring-accent h-10 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
}
