import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/app/signup/signup-form";
import { returnPathAfterAuth } from "@/lib/site-url";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthCard
      eyebrow="Get started"
      title="Create your account"
      description="Build one private identity, then present it however you choose."
    >
      <SignupForm next={returnPathAfterAuth(next)} />
    </AuthCard>
  );
}
