import Link from "next/link";
import { logLoadError } from "@/lib/server-log";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { getOwnProfile } from "@/domains/identity/profile-service";
import { getOwnEntries } from "@/domains/identity/entries-service";
import { computeCompletion } from "@/domains/identity/completion";
import type { EntryItem, EntryKind } from "@/domains/identity/entry-kinds";
import { ProfileWorkspace } from "@/app/profile/profile-workspace";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; section?: string }>;
}) {
  const { welcome, section } = await searchParams;
  try {
    const profile = await getOwnProfile();
    const stored = await getOwnEntries();
    const entries: Partial<Record<EntryKind, EntryItem[]>> = {};
    for (const e of stored) {
      (entries[e.kind] ??= []).push({
        id: e.id,
        isVisible: e.isVisible,
        data: e.data,
      });
    }
    const counts = Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [k, v.length]),
    );
    const s = (v: string | null) => v ?? "";
    const viewerName =
      profile.displayName || profile.fullName || "Your workspace";

    return (
      <WorkspaceShell viewer={{ name: viewerName }}>
        <ProfileWorkspace
          profileValues={{
            fullName: s(profile.fullName),
            displayName: s(profile.displayName),
            headline: s(profile.headline),
            summary: s(profile.summary),
            profileImageUrl: s(profile.profileImageUrl),
            coverImageUrl: s(profile.coverImageUrl),
            location: s(profile.location),
            contactEmail: s(profile.contactEmail),
            phone: s(profile.phone),
            websiteUrl: s(profile.websiteUrl),
            currentDesignation: s(profile.currentDesignation),
            currentOrganization: s(profile.currentOrganization),
            industry: s(profile.industry),
            professionalSummary: s(profile.professionalSummary),
          }}
          entries={entries}
          preview={{
            fullName: profile.fullName,
            displayName: profile.displayName,
            headline: profile.headline,
            summary: profile.summary,
            location: profile.location,
            websiteUrl: profile.websiteUrl,
            profileImageUrl: profile.profileImageUrl,
            coverImageUrl: profile.coverImageUrl,
            contactEmail: profile.contactEmail,
            phone: profile.phone,
            currentDesignation: profile.currentDesignation,
            currentOrganization: profile.currentOrganization,
            industry: profile.industry,
            professionalSummary: profile.professionalSummary,
          }}
          completion={computeCompletion(profile, counts)}
          onboarding={{
            complete: profile.onboardingCompletedAt !== null,
            step: profile.onboardingStep,
          }}
          welcome={welcome === "1"}
          initialSection={section}
        />
      </WorkspaceShell>
    );
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("/profile", error);
    const needsAuthentication = error instanceof AuthenticationRequiredError;

    return (
      <WorkspaceShell>
        <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
          <p className="eyebrow">Canonical identity</p>
          <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
            Your profile
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {needsAuthentication
              ? "Sign in with your Folioone account to manage your private identity profile."
              : "We could not load your private profile. Please try again later."}
          </p>
          <Link
            href={needsAuthentication ? "/login" : "/"}
            className="text-accent mt-6 inline-flex text-sm font-medium underline-offset-4 hover:underline"
          >
            {needsAuthentication ? "Sign in" : "Return to workspace"}
          </Link>
        </section>
      </WorkspaceShell>
    );
  }
}
