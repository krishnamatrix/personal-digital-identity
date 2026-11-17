"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
} from "react";
import { cn } from "@/lib/utils";

const styles = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
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
  VariantProps<typeof styles> & {
    asChild?: boolean;
    /**
     * The screen's server call is running. Only the button that started it shows the busy
     * "orbit" (white surface, a dot travelling around the border); others just stay disabled.
     */
    pending?: boolean;
    /** Force the busy orbit on (for a button that owns its own loading state). */
    busy?: boolean;
  };

/** How long a click may take to start a server call before it no longer counts as "this one". */
const ARM_WINDOW_MS = 600;

export function Button({
  className,
  variant,
  size,
  asChild,
  pending,
  busy,
  onClick,
  children,
  ...props
}: Props) {
  const [armed, setArmed] = useState(false);
  const sawPending = useRef(false);

  useEffect(() => {
    if (pending) sawPending.current = true;
    else if (sawPending.current) {
      sawPending.current = false;
      setArmed(false);
    }
  }, [pending]);

  // A click that opened a dialog (or failed validation) never started a call: disarm.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => {
      if (!sawPending.current) setArmed(false);
    }, ARM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const showBusy = Boolean(busy || (pending && armed));
  const Component = asChild ? Slot : "button";

  return (
    <Component
      className={cn(styles({ variant, size }), className)}
      data-busy={showBusy || undefined}
      aria-busy={showBusy || undefined}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (pending !== undefined) {
          sawPending.current = false;
          setArmed(true);
        }
        onClick?.(event);
      }}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {children}
          {showBusy && <span className="busy-orbit" aria-hidden="true" />}
        </>
      )}
    </Component>
  );
}
