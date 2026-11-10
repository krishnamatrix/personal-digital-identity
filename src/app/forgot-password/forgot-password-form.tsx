"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import {
  forgotPasswordAction,
  type ForgotPasswordState,
} from "@/app/forgot-password/actions";

const initial: ForgotPasswordState = { status: "idle", message: "" };

export function ForgotPasswordForm({ linkProblem }: { linkProblem: boolean }) {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initial,
  );

  if (state.status === "sent") {
    return (
      <div className="space-y-4" role="status">
        <p className="text-sm leading-6">{state.message}</p>
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
      {linkProblem && (
        <p className="text-sm text-red-700" role="alert">
          That link is invalid or has expired. Request a new one below.
        </p>
      )}
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
      />
      {state.status === "error" && (
        <p className="text-sm text-red-700" role="alert">
          {state.message}
        </p>
      )}
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm">
        <Link
          href="/login"
          className="text-accent underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
