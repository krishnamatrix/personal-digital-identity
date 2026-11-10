import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/app/signup/signup-form";

export default function SignupPage() {
  return (
    <AuthCard
      eyebrow="Get started"
      title="Create your account"
      description="Build one private identity, then present it however you choose."
    >
      <SignupForm />
    </AuthCard>
  );
}
