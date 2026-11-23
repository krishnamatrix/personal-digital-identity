"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { returnPathAfterAuth } from "@/lib/site-url";

export type LoginActionState = { error: string | null };
export type LogoutActionState = { error: string | null };

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const credentials = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!credentials.success) {
    return { error: "Enter a valid email address and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error:
          "Confirm your email address first: open the link we sent when you signed up.",
      };
    }
    return { error: "We could not sign you in with those credentials." };
  }

  // Someone who came from a ChatCard goes straight back to it.
  const back = returnPathAfterAuth(formData.get("next"));
  if (back) redirect(back);
  // Onboarding sends anyone who has already finished it straight on to /profile.
  redirect("/onboarding");
}

export async function logoutAction(
  _previousState: LogoutActionState,
  _formData: FormData,
): Promise<LogoutActionState> {
  void _previousState;
  void _formData;
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    return { error: "We could not sign you out. Please try again." };
  }

  redirect("/login");
}
