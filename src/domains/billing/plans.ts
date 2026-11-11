import {
  CARD_DESIGN_IDS,
  type CardDesignId,
} from "@/domains/cards/card-designs";
import { THEME_IDS, type ThemeId } from "@/domains/website/config";

/**
 * Free vs PRO: pure rules shared by the UI, the server and tests. The same lists are
 * repeated in docs/sql/milestone-9/001-pro-plans.sql (database enforcement); a test keeps
 * them in step.
 */

export type Plan = "free" | "pro";
export type BillingCurrency = "INR" | "USD";

/** One payment buys this many days of PRO (no automatic renewal). */
export const PRO_PERIOD_DAYS = 30;

/** Amounts in the currency's smallest unit (paise / cents), as Razorpay expects. */
export const PRO_PRICES: Record<
  BillingCurrency,
  { amount: number; display: string; per: string }
> = {
  INR: { amount: 29900, display: "₹299", per: "per month" },
  USD: { amount: 500, display: "$5", per: "per month" },
};

/** Digital card designs open to everyone; the rest need PRO. */
export const FREE_CARD_DESIGNS = [
  "ivory",
  "slate",
  "graphite",
  "linen",
  "coastal",
  "mint",
] as const satisfies readonly CardDesignId[];

/** Website designs open to everyone; the rest need PRO. */
export const FREE_WEBSITE_THEMES = [
  "professional",
  "creative",
  "minimal",
  "linen",
] as const satisfies readonly ThemeId[];

/** A design the account's plan does not include (thrown by the services, shown as an upgrade prompt). */
export class ProRequiredError extends Error {
  constructor() {
    super("This design is part of Folioone PRO.");
    this.name = "ProRequiredError";
  }
}

export function isProCardDesign(id: string): boolean {
  return !(FREE_CARD_DESIGNS as readonly string[]).includes(id);
}

export function isProWebsiteTheme(id: string): boolean {
  return !(FREE_WEBSITE_THEMES as readonly string[]).includes(id);
}

/** PRO is active only while the paid period lasts. */
export function isProActive(
  plan: { plan: Plan; proUntil: Date | null } | null,
  now: Date = new Date(),
): boolean {
  return Boolean(
    plan?.plan === "pro" &&
      plan.proUntil &&
      plan.proUntil.getTime() > now.getTime(),
  );
}

const INDIA_TIME_ZONES = ["Asia/Kolkata", "Asia/Calcutta"];

/**
 * Pricing currency from the visitor's location: a hosting/CDN country header first
 * (Cloudflare, Vercel, or one set by a proxy), then the browser's time zone, then its
 * language region. India pays in INR; everyone else in USD.
 */
export function currencyFor(input: {
  country?: string | null;
  timeZone?: string | null;
  acceptLanguage?: string | null;
}): BillingCurrency {
  const country = input.country?.trim().toUpperCase();
  if (country && /^[A-Z]{2}$/.test(country) && country !== "XX")
    return country === "IN" ? "INR" : "USD";
  if (input.timeZone && INDIA_TIME_ZONES.includes(input.timeZone)) return "INR";
  if (
    input.acceptLanguage &&
    /(^|[,\s])[a-z]{2,3}-IN\b/i.test(input.acceptLanguage)
  )
    return "INR";
  return "USD";
}

export const FREE_FEATURES = [
  "Master Identity, Personas and Articles",
  `${FREE_WEBSITE_THEMES.length} website designs`,
  `${FREE_CARD_DESIGNS.length} digital card designs`,
  "Publish a website and a digital card",
  "QR code and “Save contact” on your card",
] as const;

export const PRO_FEATURES = [
  "Everything in Free",
  `All ${THEME_IDS.length} website designs`,
  `All ${CARD_DESIGN_IDS.length} digital card designs`,
  "Every new design as it is added",
  "Supports an independent product",
] as const;
