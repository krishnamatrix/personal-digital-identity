import * as AvatarPrimitive from "@radix-ui/react-avatar";
import type { ComponentProps } from "react";
export function Avatar(props: ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className="bg-muted relative flex size-9 shrink-0 overflow-hidden rounded-full"
      {...props}
    />
  );
}
export const AvatarImage = AvatarPrimitive.Image;
export function AvatarFallback(
  props: ComponentProps<typeof AvatarPrimitive.Fallback>,
) {
  return (
    <AvatarPrimitive.Fallback
      className="flex size-full items-center justify-center text-xs font-semibold"
      {...props}
    />
  );
}
