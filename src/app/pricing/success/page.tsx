import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Globe, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getMyPlan } from "@/domains/billing/billing-service";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { logLoadError } from "@/lib/server-log";

export const metadata: Metadata = { title: "Welcome to PRO" };
export const dynamic = "force-dynamic";

/** Confirmation after a verified payment. Reads the plan again; never trusts the URL. */
export default async function PricingSuccessPage() {
  let plan: Awaited<ReturnType<typeof getMyPlan>> | null = null;
  try {
    plan = await getMyPlan();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/login");
    logLoadError("/pricing/success", error);
  }

  return (
    <WorkspaceShell>
      <section className="border-border bg-card mx-auto max-w-xl rounded-[28px] border p-8 text-center md:p-12">
        {plan?.isPro ? (
          <>
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-white">
              <BadgeCheck aria-hidden className="size-7" />
            </span>
            <h1 className="font-display mt-6 text-3xl md:text-4xl">
              You are now a PRO user.
            </h1>
            <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
              Thank you. Payment received and every design is unlocked
              {plan.proUntil
                ? ` until ${new Date(plan.proUntil).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`
                : ""}
              .
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/website">
                  <Globe aria-hidden className="size-4" /> Website designs
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/cards">
                  <IdCard aria-hidden className="size-4" /> Card designs
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl">No PRO plan yet</h1>
            <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
              We have not received a confirmed payment for your account. If you
              just paid and were charged, contact support with your payment ID.
            </p>
            <Button asChild className="mt-8">
              <Link href="/pricing">See plans</Link>
            </Button>
          </>
        )}
      </section>
    </WorkspaceShell>
  );
}
