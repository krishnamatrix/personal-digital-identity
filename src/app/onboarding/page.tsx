import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { getOnboardingContext } from "@/domains/identity/profile-service";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";
import { AuthCard } from "@/components/auth/auth-card";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let context;
  try {
    context = await getOnboardingContext();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/login");
    return (
      <AuthCard
        eyebrow="Setup"
        title="Setup is unavailable"
        description="We could not load your profile. Please try again in a moment."
      >
        <Link href="/profile" className="text-accent text-sm underline">
          Go to your workspace
        </Link>
      </AuthCard>
    );
  }
  const { profile, signupName } = context;
  if (profile.onboardingCompletedAt) redirect("/profile");

  return (
    <OnboardingFlow
      initialStep={profile.onboardingStep}
      values={{
        fullName: profile.fullName ?? signupName ?? "",
        displayName: profile.displayName ?? "",
        headline: profile.headline ?? "",
        currentDesignation: profile.currentDesignation ?? "",
        currentOrganization: profile.currentOrganization ?? "",
        industry: profile.industry ?? "",
        professionalSummary: profile.professionalSummary ?? "",
        profileImageUrl: profile.profileImageUrl ?? "",
        location: profile.location ?? "",
        contactEmail: profile.contactEmail ?? "",
        phone: profile.phone ?? "",
        websiteUrl: profile.websiteUrl ?? "",
        primaryPurpose: profile.primaryPurpose ?? "",
      }}
    />
  );
}
