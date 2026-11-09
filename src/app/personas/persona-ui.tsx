import Link from "next/link";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PersonaActionResult } from "@/app/personas/actions";
import type { FieldProvenance } from "@/domains/personas/persona-types";

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Monogram from the name's words: letters only, ignoring "(copy)" and numbers. */
export function initialsOf(name: string) {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word));
  return (
    (words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

export function truncate(value: string, max = 110) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Identifies fixture data so it is never mistaken for saved data. */
export function StorageNotice({ kind }: { kind: string }) {
  if (kind !== "in-memory-fixture") return null;
  return (
    <aside
      aria-label="Data storage notice"
      className="flex items-start gap-3 rounded-lg border border-[#e3d2c5] bg-[#f4ece5] p-4"
    >
      <Info className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="text-muted-foreground text-sm leading-6">
        <span className="text-foreground font-medium">Preview data.</span>{" "}
        Personas are held in memory on this server for now. They are not saved
        to your database and reset when the server restarts. My Identity is
        never changed by anything you do here.
      </p>
    </aside>
  );
}

export function FailureAlert({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // Not a live region: screens call announce() so assistive technology hears
    // each message once, instead of twice (alert role plus announcer).
    <div className="border-danger/30 bg-danger-soft rounded-lg border p-4">
      <p className="text-danger text-sm font-medium">{title}</p>
      {children && (
        <div className="text-foreground/80 mt-1 text-sm leading-6">
          {children}
        </div>
      )}
      {actions && <div className="mt-3 flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

const PROVENANCE_TEXT: Record<FieldProvenance, string> = {
  identity: "From My Identity",
  persona: "Persona-specific version",
  blank: "Intentionally blank",
  empty: "No value in My Identity",
};

export function ProvenanceBadge({
  provenance,
}: {
  provenance: FieldProvenance;
}) {
  return (
    <Badge
      className={
        provenance === "persona" || provenance === "blank"
          ? ""
          : "bg-muted text-muted-foreground"
      }
    >
      {PROVENANCE_TEXT[provenance]}
    </Badge>
  );
}

export function failureMessage<T>(result: PersonaActionResult<T>) {
  return result.ok ? "" : result.message;
}

/** Shown with a "signed out" failure so the user can get back in without losing the page. */
export function SignInAction() {
  return (
    <Link
      href="/login"
      className="bg-accent hover:bg-accent/90 inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-white"
    >
      Sign in
    </Link>
  );
}

export const SIGNED_OUT_TITLE = "You have been signed out";
