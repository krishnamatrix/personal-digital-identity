"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export type ForgotPasswordState = {
  status: "idle" | "error" | "sent";
  message: string;
};

export async function forgotPasswordAction(
  _previous: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) {
    return { status: "error", message: "Enter a valid email address." };
  }
  try {
    const supabase = await createClient();
    const site = await getSiteUrl();
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: `${site}/auth/callback?type=recovery&next=/reset-password`,
    });
  } catch {
    // Deliberately identical response: never reveal whether an address exists.
  }
  return {
    status: "sent",
    message:
      "If an account exists for that address, a password-reset link is on its way.",
  };
}
