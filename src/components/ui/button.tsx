import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const styles = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/90",
        outline: "border border-border bg-card hover:bg-muted",
        ghost: "hover:bg-muted",
        accent: "bg-accent text-white hover:bg-accent/90",
        secondary: "bg-muted text-foreground hover:bg-[#e6e6ea]",
        destructive: "bg-danger text-white hover:bg-danger/90",
        "destructive-outline":
          "border border-danger/40 bg-card text-danger hover:bg-danger-soft",
      },
      size: { default: "h-10 px-5", sm: "h-8 px-3.5 text-xs", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof styles> & { asChild?: boolean };
export function Button({ className, variant, size, asChild, ...props }: Props) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(styles({ variant, size }), className)}
      {...props}
    />
  );
}
