import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
export const Tabs = TabsPrimitive.Root;
export function TabsList(props: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className="border-border inline-flex gap-1 border-b"
      {...props}
    />
  );
}
export function TabsTrigger(
  props: ComponentProps<typeof TabsPrimitive.Trigger>,
) {
  return (
    <TabsPrimitive.Trigger
      className="text-muted-foreground data-[state=active]:border-accent data-[state=active]:text-foreground border-b-2 border-transparent px-3 py-2 text-sm"
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;
