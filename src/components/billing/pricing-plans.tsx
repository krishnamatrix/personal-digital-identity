"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  browserTimeZone,
  UpgradeButton,
} from "@/components/billing/upgrade-button";
import { pricingCurrencyAction } from "@/app/pricing/actions";
import {
  FREE_FEATURES,
  PRO_FEATURES,
  PRO_PRICES,
  type BillingCurrency,
} from "@/domains/billing/plans";

export type PricingViewer =
  | { signedIn: false }
  | { signedIn: true; isPro: boolean; proUntil: string | null };

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Free and PRO side by side. The price follows the visitor's location (INR in India, USD
 * elsewhere); the server makes the same decision when it creates the payment order.
 */
export function PricingPlans({
  initialCurrency,
  viewer,
  billingReady,
}: {
  initialCurrency: BillingCurrency;
  viewer: PricingViewer;
  billingReady: boolean;
}) {
  const [currency, setCurrency] = useState(initialCurrency);
  useEffect(() => {
    const tz = browserTimeZone();
    if (!tz) return;
    let live = true;
    pricingCurrencyAction(tz)
      .then((c) => live && setCurrency(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const price = PRO_PRICES[currency];
  const isPro = viewer.signedIn && viewer.isPro;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <article className="border-border bg-card flex flex-col rounded-2xl border p-7 md:p-8">
        <h3 className="text-lg font-semibold">Free</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Everything you need to get started.
        </p>
        <p className="mt-6 flex items-baseline gap-1.5">
          <span className="font-display text-5xl">
            {currency === "INR" ? "₹0" : "$0"}
          </span>
          <span className="text-muted-foreground text-sm">forever</span>
        </p>
        <ul className="mt-7 flex-1 space-y-3 text-[15px]">
          {FREE_FEATURES.map((f) => (
            <li key={f} className="flex gap-2.5">
              <Check
                aria-hidden
                className="text-success mt-0.5 size-4 shrink-0"
              />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-8">
          {viewer.signedIn ? (
            <Button variant="secondary" className="h-11 w-full" disabled>
              {isPro ? "Included in PRO" : "Your current plan"}
            </Button>
          ) : (
            <Button asChild variant="secondary" className="h-11 w-full">
              <Link href="/signup">Get started free</Link>
            </Button>
          )}
        </div>
      </article>

      <article className="relative flex flex-col overflow-hidden rounded-2xl bg-[#1d1d1f] p-7 text-white md:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-gradient-to-br from-amber-400/40 to-orange-600/10 blur-3xl"
        />
        <div className="relative flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            PRO
            <Sparkles
              aria-hidden
              className="ml-2 inline size-4 text-amber-300"
            />
          </h3>
        </div>
        <p className="relative mt-1 text-sm text-white/70">
          Every design, for every way you present yourself.
        </p>
        <p className="relative mt-6 flex items-baseline gap-1.5">
          <span className="font-display text-5xl" data-testid="pro-price">
            {price.display}
          </span>
          <span className="text-sm text-white/70">{price.per}</span>
        </p>
        <ul className="relative mt-7 flex-1 space-y-3 text-[15px]">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex gap-2.5">
              <Check
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-amber-300"
              />
              {f}
            </li>
          ))}
        </ul>
        <div className="relative mt-8">
          {!viewer.signedIn ? (
            <Button
              asChild
              className="h-11 w-full bg-white text-[#1d1d1f] hover:bg-white/90"
            >
              <Link href="/signup">Create an account to upgrade</Link>
            </Button>
          ) : isPro ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-white/10 px-4 py-3 text-sm">
                You are on PRO
                {viewer.proUntil ? ` until ${dateLabel(viewer.proUntil)}` : ""}.
              </p>
              {billingReady && (
                <UpgradeButton className="h-11 w-full bg-white text-[#1d1d1f] hover:bg-white/90">
                  Add 30 more days for {price.display}
                </UpgradeButton>
              )}
            </div>
          ) : billingReady ? (
            <UpgradeButton className="h-11 w-full bg-white text-[#1d1d1f] hover:bg-white/90">
              Upgrade for {price.display}/month
            </UpgradeButton>
          ) : (
            <Button className="h-11 w-full" disabled>
              Payments coming soon
            </Button>
          )}
          <p className="mt-3 text-xs text-white/60">
            One payment = 30 days of PRO. No automatic renewal; pay again when
            you want to continue. Secure payment by Razorpay.
          </p>
        </div>
      </article>
    </div>
  );
}
