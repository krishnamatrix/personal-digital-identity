"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  saveProfileAction,
  type ProfileActionState,
} from "@/app/profile/actions";

type EditableProfile = {
  displayName: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
};

const initialState: ProfileActionState = { status: "idle", message: "" };

export function ProfileEditor({ profile }: { profile: EditableProfile }) {
  const [state, formAction, pending] = useActionState(
    saveProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-7">
      <section className="border-border bg-card space-y-6 rounded-lg border p-6 md:p-8">
        <div>
          <p className="text-accent text-xs font-semibold tracking-[.14em] uppercase">
            Canonical identity
          </p>
          <h1 className="mt-2 font-serif text-3xl">Your profile</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Keep your core story in one private place. You choose what to
            include in a published presentation later.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <ProfileField
            id="displayName"
            label="Name"
            defaultValue={profile.displayName ?? ""}
            error={state.fieldErrors?.displayName?.[0]}
            autoComplete="name"
          />
          <ProfileField
            id="headline"
            label="Professional headline"
            defaultValue={profile.headline ?? ""}
            error={state.fieldErrors?.headline?.[0]}
            placeholder="Product designer and thoughtful builder"
          />
          <ProfileField
            id="location"
            label="Location"
            defaultValue={profile.location ?? ""}
            error={state.fieldErrors?.location?.[0]}
            autoComplete="address-level2"
          />
          <ProfileField
            id="websiteUrl"
            label="Website"
            defaultValue={profile.websiteUrl ?? ""}
            error={state.fieldErrors?.websiteUrl?.[0]}
            type="url"
            placeholder="https://example.com"
          />
          <ProfileField
            id="linkedinUrl"
            label="LinkedIn profile"
            defaultValue={profile.linkedinUrl ?? ""}
            error={state.fieldErrors?.linkedinUrl?.[0]}
            type="url"
            placeholder="https://www.linkedin.com/in/…"
          />
          <ProfileField
            id="githubUrl"
            label="GitHub profile"
            defaultValue={profile.githubUrl ?? ""}
            error={state.fieldErrors?.githubUrl?.[0]}
            type="url"
            placeholder="https://github.com/…"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="summary">
            A short introduction
          </label>
          <Textarea
            id="summary"
            name="summary"
            defaultValue={profile.summary ?? ""}
            aria-describedby={
              state.fieldErrors?.summary ? "summary-error" : undefined
            }
            aria-invalid={Boolean(state.fieldErrors?.summary)}
            maxLength={2000}
            rows={6}
            placeholder="What do you care about, and what kind of work do you do?"
          />
          {state.fieldErrors?.summary?.[0] && (
            <p id="summary-error" className="text-sm text-red-700">
              {state.fieldErrors.summary[0]}
            </p>
          )}
        </div>

        <p className="text-muted-foreground border-border border-t pt-4 text-xs">
          Private by default. Saving does not publish or share this information.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {state.message && (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={
              state.status === "error"
                ? "text-sm text-red-700"
                : "text-muted-foreground text-sm"
            }
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function ProfileField({
  id,
  label,
  defaultValue,
  error,
  ...inputProps
}: {
  id: string;
  label: string;
  defaultValue: string;
  error?: string;
} & Omit<React.ComponentProps<typeof Input>, "id" | "name" | "defaultValue">) {
  const errorId = `${id}-error`;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        name={id}
        defaultValue={defaultValue}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
