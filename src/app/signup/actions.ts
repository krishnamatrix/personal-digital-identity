"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, returnPathAfterAuth } from "@/lib/site-url";

export type SignupActionState = {
  status: "idle" | "error" | "check_email";
  message: string;
  fieldErrors?: Record<string, string>;
};

const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name.").max(120),
    email: z.email("Enter a valid email address.").max(254),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Use at most 72 characters."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export async function signupAction(
  _previous: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return {
      status: "error",
      message: "Review the highlighted fields.",
      fieldErrors,
    };
  }

  const { name, email, password } = parsed.data;
  // From a ChatCard: confirm, then land back on that card (onboarding can wait).
  const back = returnPathAfterAuth(formData.get("next"));
  let signedIn = false;
  try {
    const supabase = await createClient();
    const site = await getSiteUrl();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        // `back` is one of a few fixed path shapes (no characters that need encoding).
        emailRedirectTo: `${site}/auth/callback?next=${back ?? "/onboarding"}`,
      },
    });
    if (error) {
      return {
        status: "error",
        message:
          error.code === "weak_password"
            ? "Choose a stronger password."
            : "We could not create your account. Please try again.",
      };
    }
    signedIn = Boolean(data.session);
  } catch {
    return {
      status: "error",
      message: "Sign-up is unavailable right now. Please try again later.",
    };
  }

  // With email confirmation off (local development) a session exists immediately.
  if (signedIn) redirect(back ?? "/onboarding");
  // Same response whether or not the address was already registered (no account enumeration).
  return {
    status: "check_email",
    message: `If ${email} can be registered, we sent a confirmation link to it.`,
  };
}
