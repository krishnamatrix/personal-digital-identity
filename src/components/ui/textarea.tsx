import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "border-border bg-card placeholder:text-muted-foreground focus-visible:ring-accent min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
}
