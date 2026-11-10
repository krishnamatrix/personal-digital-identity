import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/app/forgot-password/forgot-password-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your email and we will send you a link to choose a new password."
    >
      <ForgotPasswordForm linkProblem={error === "link_invalid"} />
    </AuthCard>
  );
}
