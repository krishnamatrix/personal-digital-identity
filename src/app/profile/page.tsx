import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { getOwnProfile } from "@/domains/identity/profile-service";
import { ProfileEditor } from "@/app/profile/profile-editor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  try {
    const profile = await getOwnProfile();
    return (
      <WorkspaceShell>
        <ProfileEditor
          profile={{
            displayName: profile.displayName,
            headline: profile.headline,
            summary: profile.summary,
            location: profile.location,
            websiteUrl: profile.websiteUrl,
            linkedinUrl: profile.linkedinUrl,
            githubUrl: profile.githubUrl,
          }}
        />
      </WorkspaceShell>
    );
  } catch (error) {
    const needsAuthentication = error instanceof AuthenticationRequiredError;

    return (
      <WorkspaceShell>
        <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
          <p className="text-accent text-xs font-semibold tracking-[.14em] uppercase">
            Canonical identity
          </p>
          <h1 className="mt-2 font-serif text-3xl">Your profile</h1>
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
