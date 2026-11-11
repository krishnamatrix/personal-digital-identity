import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getViewer } from "@/domains/identity/viewer";
import { getMyPlan, requestCurrency } from "@/domains/billing/billing-service";
import { isBillingConfigured } from "@/lib/billing/razorpay";
import { logLoadError } from "@/lib/server-log";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Folioone Free and PRO plans.",
};
export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  cards: "That card design is part of PRO.",
  website: "That website design is part of PRO.",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const viewer = await getViewer();
  const currency = await requestCurrency();
  const billingReady = isBillingConfigured();

  let proUntil: string | null = null;
  if (viewer?.isPro) {
    try {
      proUntil = (await getMyPlan()).proUntil;
    } catch (error) {
      logLoadError("/pricing", error);
    }
  }

  const body = (
    <div className="mx-auto max-w-4xl">
      <div className="text-center">
        <p className="eyebrow">Pricing</p>
        <h1 className="font-display mt-4 text-4xl md:text-5xl">
          Simple plans. Private by default.
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-[15px] leading-relaxed">
          {from && REASON[from] ? `${REASON[from]} ` : ""}
          Start free with the essentials. Upgrade to PRO for every website and
          digital card design.
        </p>
      </div>
      <div className="mt-12">
        <PricingPlans
          initialCurrency={currency}
          billingReady={billingReady}
          viewer={
            viewer
              ? { signedIn: true, isPro: viewer.isPro, proUntil }
              : { signedIn: false }
          }
        />
      </div>
      {viewer && (
        <p className="text-muted-foreground mt-8 text-center text-sm">
          <Link
            href={
              from === "website"
                ? "/website"
                : from === "cards"
                  ? "/cards"
                  : "/"
            }
            className="underline-offset-4 hover:underline"
          >
            Back to your workspace
          </Link>
        </p>
      )}
    </div>
  );

  if (viewer) return <WorkspaceShell>{body}</WorkspaceShell>;
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-full" aria-label="Folioone home">
          <BrandMark />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Create account</Link>
          </Button>
        </nav>
      </header>
      <main className="px-4 py-12 sm:px-6 md:py-20">{body}</main>
    </div>
  );
}
