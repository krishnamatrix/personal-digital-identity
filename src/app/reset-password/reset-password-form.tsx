"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import {
  resetPasswordAction,
  type ResetPasswordState,
} from "@/app/reset-password/actions";

const initial: ResetPasswordState = { error: null };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initial,
  );
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormField
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <FormField
        id="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
      />
      {state.error && (
        <p className="text-danger text-sm" role="alert">
          {state.error}{" "}
          {state.error.includes("expired") && (
            <Link href="/forgot-password" className="underline">
              Request a new link
            </Link>
          )}
        </p>
      )}
      <Button
        pending={pending}
        className="w-full"
        disabled={pending}
        type="submit"
      >
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
