import Link from "next/link";
import { logLoadError } from "@/lib/server-log";
import { redirect } from "next/navigation";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { getOnboardingContext } from "@/domains/identity/profile-service";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";
import { AuthCard } from "@/components/auth/auth-card";
import { isResumeExtractionConfigured } from "@/lib/ai/resume-extractor";
import { myProfileImageDisplayUrl } from "@/domains/media/profile-image-service";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let context;
  let imageUrl: string | null = null;
  try {
    context = await getOnboardingContext();
    imageUrl = await myProfileImageDisplayUrl(context.profile.profileImageUrl);
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("/onboarding", error);
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
      resumeImportEnabled={isResumeExtractionConfigured()}
      imageUrl={imageUrl}
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
