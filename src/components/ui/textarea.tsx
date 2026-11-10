import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "border-border bg-card placeholder:text-muted-foreground focus-visible:ring-foreground/15 focus-visible:border-foreground/30 min-h-24 w-full rounded-md border px-3.5 py-2.5 text-sm transition-shadow outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
}
