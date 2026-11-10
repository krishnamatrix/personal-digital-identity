import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
export const Tabs = TabsPrimitive.Root;
export function TabsList(props: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className="bg-muted inline-flex gap-1 rounded-full p-1"
      {...props}
    />
  );
}
export function TabsTrigger(
  props: ComponentProps<typeof TabsPrimitive.Trigger>,
) {
  return (
    <TabsPrimitive.Trigger
      className="text-muted-foreground hover:text-foreground data-[state=active]:bg-foreground data-[state=active]:text-background rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;
