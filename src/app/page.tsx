import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";
import { Dashboard } from "@/components/workspace/dashboard";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getViewer } from "@/domains/identity/viewer";
import { requestCurrency } from "@/domains/billing/billing-service";
import { isBillingConfigured } from "@/lib/billing/razorpay";

export const metadata: Metadata = {
  title: { absolute: "Folioone — One identity. Every way you present it." },
  description:
    "Keep your professional story in one private place and publish it as a portfolio website, in the design that fits each audience.",
};

/** Signed-in people land on their workspace; everyone else sees the landing page. */
export default async function HomePage() {
  const viewer = await getViewer();
  if (!viewer)
    return (
      <LandingPage
        currency={await requestCurrency()}
        billingReady={isBillingConfigured()}
      />
    );
  return (
    <WorkspaceShell>
      <Dashboard viewer={viewer} />
    </WorkspaceShell>
  );
}
