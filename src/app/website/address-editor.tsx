"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { checkSlugAction, saveSlugAction } from "@/app/website/actions";
import {
  normalizeSlug,
  SLUG_MAX,
  SLUG_MESSAGES,
  validateSlug,
} from "@/domains/website/slug";

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "invalid"; text: string }
  | { state: "available" | "yours" | "taken" | "error"; text: string };

export function AddressEditor({
  origin,
  slug,
  published,
  suggestion,
  onSaved,
}: {
  origin: string;
  slug: string | null;
  published: boolean;
  suggestion: string;
  onSaved: (slug: string) => void;
}) {
  const [value, setValue] = useState(slug ?? suggestion);
  const [availability, setAvailability] = useState<Availability>({
    state: "idle",
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const seq = useRef(0);
  const normalized = normalizeSlug(value);
  const changed = normalized !== (slug ?? "");

  useEffect(() => {
    const problem = validateSlug(normalized);
    if (!normalized) return setAvailability({ state: "idle" });
    if (problem)
      return setAvailability({
        state: "invalid",
        text: SLUG_MESSAGES[problem],
      });
    if (normalized === slug)
      return setAvailability({
        state: "yours",
        text: "This is your current address.",
      });
    setAvailability({ state: "checking" });
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const r = await checkSlugAction(normalized);
      if (mine !== seq.current) return;
      if (r.state === "available")
        setAvailability({
          state: "available",
          text: "Looks available. It is confirmed when you save.",
        });
      else if (r.state === "yours")
        setAvailability({
          state: "yours",
          text: "This is your current address.",
        });
      else if (r.state === "taken")
        setAvailability({
          state: "taken",
          text: "That address is already taken.",
        });
      else if (r.state === "invalid")
        setAvailability({ state: "invalid", text: SLUG_MESSAGES[r.problem] });
      else
        setAvailability({
          state: "error",
          text: "Could not check right now. You can still try saving.",
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [normalized, slug]);

  function save() {
    setMessage(null);
    setConfirming(false);
    startTransition(async () => {
      const r = await saveSlugAction(normalized);
      setMessage({ ok: r.ok, text: r.message });
      if (r.ok && r.slug) onSaved(r.slug);
    });
  }

  const blocked =
    availability.state === "invalid" ||
    availability.state === "taken" ||
    !normalized ||
    !changed;
  const tone =
    availability.state === "available" || availability.state === "yours"
      ? "text-green-800"
      : availability.state === "checking" || availability.state === "idle"
        ? "text-muted-foreground"
        : "text-danger";

  return (
    <div className="max-w-xl space-y-4">
      <label htmlFor="slug" className="text-sm font-medium">
        Your address
      </label>
      <div className="flex items-center gap-0 text-sm">
        <span className="border-border bg-muted text-muted-foreground flex h-10 items-center rounded-l-md border border-r-0 px-3 break-all">
          {origin.replace(/^https?:\/\//, "")}/
        </span>
        <Input
          id="slug"
          className="rounded-l-none"
          value={value}
          maxLength={SLUG_MAX + 10}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby="slug-status"
          aria-invalid={
            availability.state === "invalid" || availability.state === "taken"
              ? true
              : undefined
          }
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <p id="slug-status" role="status" className={`min-h-5 text-sm ${tone}`}>
        {availability.state === "checking"
          ? "Checking…"
          : "text" in availability
            ? availability.text
            : ""}
      </p>
      <p className="text-muted-foreground text-xs leading-5">
        Lowercase letters, numbers and hyphens, 3–40 characters. It is
        independent of your email and account.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending || blocked}
          onClick={() => (published && slug ? setConfirming(true) : save())}
        >
          {pending ? "Saving…" : slug ? "Change address" : "Claim this address"}
        </Button>
        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={
              message.ok ? "text-sm text-green-800" : "text-danger text-sm"
            }
          >
            {message.text}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Change your live address?"
        description={
          <>
            Your website is live at <strong>/{slug}</strong>. After this change
            that address stops working immediately and anyone with the old link
            will see a not-found page. Your new address will be{" "}
            <strong>/{normalized}</strong>.
          </>
        }
        confirmLabel="Change address"
        tone="danger"
        pending={pending}
        onConfirm={save}
      />
    </div>
  );
}
