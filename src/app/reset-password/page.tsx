import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  let signedIn = false;
  try {
    const supabase = await createClient();
    signedIn = Boolean((await supabase.auth.getUser()).data.user);
  } catch {
    redirect("/forgot-password");
  }
  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Pick a password you do not use anywhere else."
    >
      {signedIn ? (
        <ResetPasswordForm />
      ) : (
        <p className="text-sm leading-6">
          This reset link has expired or was already used.{" "}
          <Link href="/forgot-password" className="text-accent underline">
            Request a new one
          </Link>
          .
        </p>
      )}
    </AuthCard>
  );
}
