"use client";

import { useActionState } from "react";
import { logoutAction, type LogoutActionState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

const initialState: LogoutActionState = { error: null };

export function LogoutButton() {
  const [state, formAction, pending] = useActionState(
    logoutAction,
    initialState,
  );

  return (
    <form action={formAction}>
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {state.error && (
        <p className="text-danger px-3 py-2 text-xs" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
