import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export function DropdownMenuContent({
  className = "",
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={6}
        className={`border-border bg-card z-50 min-w-44 rounded-2xl border p-1.5 shadow-xl ${className}`}
        {...props}
      />
    </Menu.Portal>
  );
}
export function DropdownMenuItem({
  className = "",
  ...props
}: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={`focus:bg-muted cursor-pointer rounded-lg px-3 py-2 text-sm outline-none ${className}`}
      {...props}
    />
  );
}
