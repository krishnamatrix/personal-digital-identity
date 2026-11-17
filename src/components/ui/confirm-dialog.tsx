"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: "default" | "danger";
  confirmDisabled?: boolean;
  children?: ReactNode;
};

/** Confirmation built on the shared Dialog (focus trap, Escape, labelled). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  tone = "default",
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  // These dialogs are controlled (no Radix trigger), so remember what had focus
  // when the dialog opened and give focus back to it on close. A layout effect
  // runs before Radix moves focus into the dialog.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          const element = opener.current;
          if (element?.isConnected) {
            event.preventDefault();
            element.focus();
          }
        }}
      >
        <DialogTitle className="font-display pr-6 text-xl">{title}</DialogTitle>
        <DialogDescription asChild>
          <div className="text-muted-foreground mt-2 text-sm leading-6">
            {description}
          </div>
        </DialogDescription>
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <DialogClose asChild>
            <Button pending={pending} variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            pending={pending}
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={pending || confirmDisabled}
            onClick={onConfirm}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
