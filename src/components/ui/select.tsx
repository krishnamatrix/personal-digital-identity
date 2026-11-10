import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props} />;
}
export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "border-border bg-card flex h-11 w-full items-center justify-between rounded-md border px-3.5 text-sm",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
export const SelectValue = SelectPrimitive.Value;
export function SelectContent(
  props: ComponentProps<typeof SelectPrimitive.Content>,
) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className="border-border bg-card z-50 rounded-2xl border p-1.5 shadow-xl"
        position="popper"
        {...props}
      />
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "focus:bg-muted cursor-pointer rounded-lg px-3 py-2 text-sm outline-none",
        className,
      )}
      {...props}
    />
  );
}
