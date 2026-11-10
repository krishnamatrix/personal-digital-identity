"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState = { error: string | null };

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters.").max(72),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export async function resetPasswordAction(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your password." };
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return {
        error: "This reset link has expired. Request a new one to continue.",
      };
    }
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) {
      return {
        error:
          error.code === "same_password"
            ? "Choose a password you have not used before."
            : error.code === "weak_password"
              ? "Choose a stronger password."
              : "We could not update your password. Please try again.",
      };
    }
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    return { error: "We could not update your password. Please try again." };
  }
  redirect("/login?message=password_updated");
}
