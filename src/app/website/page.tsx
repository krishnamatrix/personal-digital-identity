import Link from "next/link";
import { logLoadError } from "@/lib/server-log";
import { getViewer } from "@/domains/identity/viewer";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import {
  entrySubtitle,
  entryTitle,
  type EntryKind,
} from "@/domains/identity/entry-kinds";
import { sectionHasContent } from "@/domains/website/build-published";
import {
  defaultConfig,
  SECTION_IDS,
  type SectionId,
} from "@/domains/website/config";
import { getWebsiteState } from "@/domains/website/website-service";
import { suggestSlug } from "@/domains/website/slug";
import {
  WebsiteWorkspace,
  type EntryChoice,
} from "@/app/website/website-workspace";

export const dynamic = "force-dynamic";

const SECTION_KIND: Partial<Record<SectionId, EntryKind>> = {
  featured: "featured_post",
  experience: "employment",
  education: "education",
  skills: "skill",
  projects: "project",
  achievements: "achievement",
  certifications: "certification",
  social: "social_link",
};

export default async function WebsitePage() {
  try {
    const state = await getWebsiteState();
    const { source, site } = state;
    const config = site?.config ?? defaultConfig();
    const origin = await getSiteUrl();
    const viewer = await getViewer();

    const choices: Partial<Record<SectionId, EntryChoice[]>> = {};
    const hasContent = {} as Record<SectionId, boolean>;
    for (const id of SECTION_IDS) {
      hasContent[id] = sectionHasContent(source, config, id);
      const kind = SECTION_KIND[id];
      if (kind) {
        choices[id] = (source.entries[kind] ?? []).map((e) => ({
          id: e.id,
          title: entryTitle(kind, e.data),
          subtitle: entrySubtitle(kind, e.data),
          masterVisible: e.isVisible,
        }));
      }
    }
    const articleChoices = (source.articles ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      subtitle: a.category ?? "",
    }));
    const p = source.profile;
    // Contact is opt-in, so "has content" means My Identity holds something that could be shown.
    hasContent.contact = Boolean(p.contactEmail || p.phone || p.websiteUrl);
    return (
      <WorkspaceShell>
        <WebsiteWorkspace
          origin={origin}
          isPro={viewer?.isPro ?? false}
          initial={{
            status: state.status,
            slug: site?.slug ?? null,
            theme: site?.theme ?? "professional",
            config,
            publishedAt: site?.publishedAt?.toISOString() ?? null,
            hasUnpublishedChanges: state.hasUnpublishedChanges,
            problems: state.problems,
          }}
          choices={choices}
          articleChoices={articleChoices}
          hasContent={hasContent}
          has={{
            email: Boolean(p.contactEmail),
            phone: Boolean(p.phone),
            website: Boolean(p.websiteUrl),
            name: Boolean(p.displayName || p.fullName),
          }}
          suggestedSlug={suggestSlug(state.profileName)}
        />
      </WorkspaceShell>
    );
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("/website", error);
    const needsAuth = error instanceof AuthenticationRequiredError;
    return (
      <WorkspaceShell>
        <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
          <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
            My Website
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {needsAuth
              ? "Sign in to create and publish your website."
              : "We could not load your website settings. Please try again later."}
          </p>
          <Link
            href={needsAuth ? "/login" : "/"}
            className="text-accent mt-6 inline-flex text-sm font-medium underline-offset-4 hover:underline"
          >
            {needsAuth ? "Sign in" : "Return to workspace"}
          </Link>
        </section>
      </WorkspaceShell>
    );
  }
}
