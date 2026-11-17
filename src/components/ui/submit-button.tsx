"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

/** Submit button for a server-action <form>: shows the busy orbit while that form is submitting. */
export function SubmitButton({
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "busy" | "pending">) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      busy={pending}
      disabled={pending || disabled}
      {...props}
    />
  );
}
