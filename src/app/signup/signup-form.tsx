"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { signupAction, type SignupActionState } from "@/app/signup/actions";

const initial: SignupActionState = { status: "idle", message: "" };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initial);

  if (state.status === "check_email") {
    return (
      <div className="space-y-4" role="status">
        <h2 className="font-serif text-xl">Check your email</h2>
        <p className="text-muted-foreground text-sm leading-6">
          {state.message} Open it on this device and select the link to confirm
          your address and start setting up your profile.
        </p>
        <Link
          href="/login"
          className="text-accent text-sm font-medium underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormField
        id="name"
        label="Full name"
        autoComplete="name"
        required
        error={state.fieldErrors?.name}
      />
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        error={state.fieldErrors?.password}
      />
      <FormField
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      {state.status === "error" && !state.fieldErrors && (
        <p className="text-sm text-red-700" role="alert">
          {state.message}
        </p>
      )}
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-accent underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
