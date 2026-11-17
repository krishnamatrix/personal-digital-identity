import type { Metadata } from "next";
import Link from "next/link";
import { logLoadError } from "@/lib/server-log";
import { getSiteUrl } from "@/lib/site-url";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import {
  getMyInsights,
  INSIGHT_RANGES,
  type InsightRange,
} from "@/domains/insights/insights-service";
import { InsightsDashboard } from "@/app/insights/insights-dashboard";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

function Message({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
      <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
        {title}
      </h1>
      <p className="text-muted-foreground mt-3 text-sm leading-6">{body}</p>
      <Link
        href={href}
        className="text-accent mt-6 inline-flex text-sm font-medium underline-offset-4 hover:underline"
      >
        {cta}
      </Link>
    </section>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const requested = Number((await searchParams).range);
  const range: InsightRange = (INSIGHT_RANGES as readonly number[]).includes(
    requested,
  )
    ? (requested as InsightRange)
    : 30;
  try {
    const insights = await getMyInsights(range);
    if (insights.state === "no_pages") {
      return (
        <WorkspaceShell>
          <Message
            title="Insights"
            body="Insights start when your website or digital card is published. Publish one, share the link, and you will see visits, link clicks and where visitors come from."
            href="/website"
            cta="Publish your website"
          />
        </WorkspaceShell>
      );
    }
    const origin = await getSiteUrl();
    return (
      <WorkspaceShell>
        <InsightsDashboard
          report={insights.report}
          has={insights.has}
          range={range}
          websiteUrl={
            insights.websiteSlug ? `${origin}/${insights.websiteSlug}` : null
          }
        />
      </WorkspaceShell>
    );
  } catch (error) {
    const needsAuth = error instanceof AuthenticationRequiredError;
    if (!needsAuth) logLoadError("/insights", error);
    return (
      <WorkspaceShell>
        <Message
          title="Insights"
          body={
            needsAuth
              ? "Sign in to see how people use your website and card."
              : "We could not load your insights. Please try again later."
          }
          href={needsAuth ? "/login" : "/"}
          cta={needsAuth ? "Sign in" : "Return to workspace"}
        />
      </WorkspaceShell>
    );
  }
}
