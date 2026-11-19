"use client";

import { FileUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResumeImport } from "@/app/onboarding/resume-import";

const DISMISS_KEY = "folioone:resume-prompt-dismissed";

/**
 * Resume import from the profile. Always offered as a button; when the profile has no
 * experience or education yet (typically: the resume step was skipped in onboarding), also
 * as a card at the top, which the person can dismiss.
 */
export function ResumeImportPanel({
  suggest,
  hasUnsavedChanges,
  onImported,
}: {
  /** Show the prominent card (the profile has no experience or education yet). */
  suggest: boolean;
  hasUnsavedChanges: boolean;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* the card simply comes back next time */
    }
  };

  return (
    <>
      {suggest && !dismissed ? (
        <section
          aria-label="Import from your resume"
          className="border-border bg-card relative flex flex-col gap-4 rounded-lg border p-5 sm:flex-row sm:items-center"
        >
          <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full">
            <FileUp aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1 pr-6">
            <p className="text-sm font-medium">
              Skipped the resume step? Fill your profile in a minute
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              Upload your resume and we will add your experience, education and
              skills. You review and edit everything here.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="shrink-0">
            Import resume
          </Button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide this suggestion"
            className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-3 right-3 rounded-full p-1"
          >
            <X aria-hidden className="size-4" />
          </button>
        </section>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <FileUp aria-hidden className="size-4" />
          Import from resume
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle className="sr-only">Import from your resume</DialogTitle>
          {hasUnsavedChanges ? (
            <div className="space-y-4 pr-6">
              <p className="text-[15px] font-medium">Save your changes first</p>
              <DialogDescription className="text-muted-foreground text-sm leading-6">
                You have unsaved changes in your profile. Save or discard them,
                then import your resume, so nothing you typed is lost.
              </DialogDescription>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  OK
                </Button>
              </div>
            </div>
          ) : (
            <div className="pr-6">
              <ResumeImport
                variant="profile"
                onImported={() => {
                  dismiss();
                  onImported();
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
