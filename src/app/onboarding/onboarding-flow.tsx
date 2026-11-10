"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  finishOnboardingAction,
  saveOnboardingStepAction,
} from "@/app/onboarding/actions";
import {
  fieldsForStep,
  ONBOARDING_STEP_COUNT,
} from "@/domains/identity/onboarding-steps";
import { BrandMark } from "@/components/brand-mark";
import { ResumeImport } from "@/app/onboarding/resume-import";
import { PRIMARY_PURPOSES } from "@/domains/identity/profile-schema";

type Values = Record<string, string>;

type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "email" | "tel" | "url" | "textarea";
  placeholder?: string;
  autoComplete?: string;
};

const FIELD_SPECS: Record<string, FieldSpec> = {
  fullName: { key: "fullName", label: "Full name", autoComplete: "name" },
  displayName: {
    key: "displayName",
    label: "Display name",
    placeholder: "How you would like to be addressed",
  },
  headline: {
    key: "headline",
    label: "Professional headline",
    placeholder: "Product designer and thoughtful builder",
  },
  currentDesignation: {
    key: "currentDesignation",
    label: "Current designation",
    placeholder: "Senior Designer",
  },
  currentOrganization: {
    key: "currentOrganization",
    label: "Current organization",
    autoComplete: "organization",
  },
  industry: { key: "industry", label: "Industry", placeholder: "Technology" },
  professionalSummary: {
    key: "professionalSummary",
    label: "Professional summary",
    type: "textarea",
    placeholder: "A few sentences about what you do and what you care about.",
  },
  profileImageUrl: {
    key: "profileImageUrl",
    label: "Profile image URL",
    type: "url",
    placeholder: "https://…",
  },
  location: {
    key: "location",
    label: "Location",
    placeholder: "City, Country",
    autoComplete: "address-level2",
  },
  contactEmail: {
    key: "contactEmail",
    label: "Contact email",
    type: "email",
    autoComplete: "email",
  },
  phone: { key: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  websiteUrl: {
    key: "websiteUrl",
    label: "Personal website",
    type: "url",
    placeholder: "https://…",
  },
};

const OPTIONAL_STEPS = new Set([3, 4, 5, 6]);

export function OnboardingFlow({
  initialStep,
  values: initialValues,
  resumeImportEnabled = false,
}: {
  initialStep: number;
  values: Values;
  /** Show "Start from your resume" on the first step (needs the Claude API configured). */
  resumeImportEnabled?: boolean;
}) {
  const [step, setStep] = useState(
    Math.min(Math.max(initialStep, 1), ONBOARDING_STEP_COUNT),
  );
  const [values, setValues] = useState<Values>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  function advance(skip: boolean) {
    setError(null);
    setFieldErrors({});
    const payload: Values = {};
    if (!skip) {
      for (const key of fieldsForStep(step)) payload[key] = values[key] ?? "";
    }
    startTransition(async () => {
      const result = await saveOnboardingStepAction(step, payload);
      if (result.ok) {
        setStep((s) => Math.min(ONBOARDING_STEP_COUNT, s + 1));
      } else {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      const result = await finishOnboardingAction();
      if (result && !result.ok) setError(result.message);
    });
  }

  const purposeLabel = PRIMARY_PURPOSES.find(
    (p) => p.value === values.primaryPurpose,
  )?.label;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8 md:py-14">
      <header className="flex items-center justify-between">
        <BrandMark />
        <Link
          href="/profile"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Skip for now
        </Link>
      </header>

      <div className="mt-8" aria-live="polite">
        <p className="text-muted-foreground text-xs">
          Step {step} of {ONBOARDING_STEP_COUNT}
        </p>
        <div
          className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={ONBOARDING_STEP_COUNT}
          aria-valuenow={step}
          aria-label="Onboarding progress"
        >
          <div
            className="bg-foreground h-full rounded-full transition-all"
            style={{ width: `${(step / ONBOARDING_STEP_COUNT) * 100}%` }}
          />
        </div>
      </div>

      <section className="border-border bg-card mt-6 flex-1 rounded-[28px] border p-6 shadow-[0_1px_3px_rgba(0,0,0,.04)] md:p-10">
        <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
          {headingFor(step)}
        </h1>
        <p className="text-muted-foreground mt-2 mb-7 text-sm leading-6">
          {introFor(step)}
        </p>

        {step === 1 && resumeImportEnabled && (
          <div className="border-border mb-7 border-b pb-7">
            <ResumeImport
              onImported={(imported) =>
                setValues((v) => {
                  const next = { ...v };
                  for (const [key, value] of Object.entries(imported)) {
                    if (value) next[key] = value;
                  }
                  return next;
                })
              }
            />
          </div>
        )}

        {step === 1 && (
          <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm leading-6">
            <li>It takes about two minutes.</li>
            <li>Every question after the first is optional.</li>
            <li>Your progress is saved, so you can leave and come back.</li>
          </ul>
        )}

        {step >= 2 && step <= 5 && (
          <div className="space-y-5">
            {fieldsForStep(step).map((key) => (
              <Field
                key={key}
                spec={FIELD_SPECS[key]!}
                value={values[key] ?? ""}
                error={fieldErrors[key]}
                onChange={(v) => set(key, v)}
              />
            ))}
            {step === 4 && (
              <p className="text-muted-foreground text-xs leading-5">
                Paste a link to an image you host elsewhere. File upload is
                coming soon.
              </p>
            )}
          </div>
        )}

        {step === 6 && (
          <fieldset className="space-y-2">
            <legend className="sr-only">Primary purpose</legend>
            {PRIMARY_PURPOSES.map((p) => (
              <label
                key={p.value}
                className="border-border hover:bg-muted flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm"
              >
                <input
                  type="radio"
                  name="primaryPurpose"
                  value={p.value}
                  checked={values.primaryPurpose === p.value}
                  onChange={() => set("primaryPurpose", p.value)}
                />
                {p.label}
              </label>
            ))}
          </fieldset>
        )}

        {step === 7 && (
          <dl className="divide-border divide-y text-sm">
            <ReviewRow
              label="Name"
              value={values.displayName || values.fullName}
            />
            <ReviewRow label="Headline" value={values.headline} />
            <ReviewRow
              label="Role"
              value={[values.currentDesignation, values.currentOrganization]
                .filter(Boolean)
                .join(" at ")}
            />
            <ReviewRow label="Location" value={values.location} />
            <ReviewRow
              label="Contact"
              value={values.contactEmail || values.phone}
            />
            <ReviewRow
              label="Profile image"
              value={values.profileImageUrl ? "Added" : ""}
            />
            <ReviewRow label="Purpose" value={purposeLabel} />
          </dl>
        )}

        {error && (
          <p className="text-danger mt-5 text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 1 || pending}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            Back
          </Button>
          <div className="flex items-center gap-2">
            {OPTIONAL_STEPS.has(step) && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => advance(true)}
              >
                Skip
              </Button>
            )}
            {step < ONBOARDING_STEP_COUNT ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() => advance(false)}
              >
                {pending ? "Saving…" : step === 1 ? "Get started" : "Continue"}
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={finish}>
                {pending ? "Finishing…" : "Finish and open my workspace"}
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function headingFor(step: number) {
  return (
    [
      "Welcome to Folioone",
      "Tell us about you",
      "Your professional introduction",
      "Add a profile image",
      "Where can people find you?",
      "What will you use Folioone for?",
      "Review and finish",
    ][step - 1] ?? ""
  );
}

function introFor(step: number) {
  return (
    [
      "Let's build the first version of your Master Identity: the private source of truth behind everything you share.",
      "Your name and a one-line headline are the heart of your profile.",
      "What do you do today? You can add your full history later.",
      "A friendly face helps. You can skip this and add one later.",
      "Share only what you are comfortable with. All of it is optional.",
      "This helps us tailor your workspace. You can change it anytime.",
      "Here is what you have shared. Everything can be edited from your profile.",
    ][step - 1] ?? ""
  );
}

function Field({
  spec,
  value,
  error,
  onChange,
}: {
  spec: FieldSpec;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const id = `onboarding-${spec.key}`;
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {spec.label}
      </label>
      {spec.type === "textarea" ? (
        <Textarea
          id={id}
          value={value}
          placeholder={spec.placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      ) : (
        <Input
          id={id}
          type={spec.type ?? "text"}
          value={value}
          placeholder={spec.placeholder}
          autoComplete={spec.autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      )}
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          value ? "text-right" : "text-muted-foreground text-right italic"
        }
      >
        {value || "Skipped"}
      </dd>
    </div>
  );
}
