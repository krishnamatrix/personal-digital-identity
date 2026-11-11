import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { id: "8b3f6c1e-2d4a-4f5b-9c6d-7e8f9a0b1c2d", email: "a@example.test" },
  activatePro: vi.fn(),
  ensureAccount: vi.fn(),
  findPlan: vi.fn(),
}));
vi.mock("@/lib/db/query", () => ({
  getAuthenticatedDb: async () => ({ client: {}, user: db.user }),
  activatePro: db.activatePro,
  ensureAccount: db.ensureAccount,
  findPlan: db.findPlan,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "accept-language": "en-US" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/pricing/actions", () => ({
  pricingCurrencyAction: vi.fn(() => new Promise(() => {})),
  startCheckoutAction: vi.fn(),
  confirmPaymentAction: vi.fn(),
}));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));

import {
  currencyFor,
  FREE_CARD_DESIGNS,
  FREE_WEBSITE_THEMES,
  isProActive,
  isProCardDesign,
  isProWebsiteTheme,
  PRO_PERIOD_DAYS,
  PRO_PRICES,
} from "@/domains/billing/plans";
import { CARD_DESIGN_IDS } from "@/domains/cards/card-designs";
import { THEME_IDS } from "@/domains/website/config";
import {
  entitlementProof,
  isValidCheckoutSignature,
} from "@/lib/billing/razorpay";
import {
  confirmProPayment,
  PaymentVerificationError,
} from "@/domains/billing/billing-service";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";

const SQL = readFileSync("docs/sql/milestone-9/001-pro-plans.sql", "utf8");
const KEY_SECRET = "rzp_test_secret_value_for_unit_tests";
const ENTITLEMENT = "e".repeat(64);
const hmac = (secret: string, msg: string) =>
  createHmac("sha256", secret).update(msg).digest("hex");

beforeEach(() => {
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
  vi.stubEnv("RAZORPAY_KEY_SECRET", KEY_SECRET);
  vi.stubEnv("FOLIOONE_ENTITLEMENT_SECRET", ENTITLEMENT);
  db.activatePro.mockReset().mockResolvedValue(new Date("2026-12-11"));
  db.ensureAccount.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("plans", () => {
  it("opens a few basic designs and locks the rest", () => {
    expect(FREE_WEBSITE_THEMES.length).toBeGreaterThanOrEqual(3);
    expect(FREE_WEBSITE_THEMES.length).toBeLessThanOrEqual(4);
    for (const id of FREE_WEBSITE_THEMES) expect(THEME_IDS).toContain(id);
    for (const id of FREE_CARD_DESIGNS) expect(CARD_DESIGN_IDS).toContain(id);
    expect(isProWebsiteTheme("professional")).toBe(false);
    expect(isProWebsiteTheme("atelier")).toBe(true);
    expect(isProCardDesign("ivory")).toBe(false);
    expect(isProCardDesign("noir")).toBe(true);
  });

  it("prices India in INR and everyone else in USD", () => {
    expect(currencyFor({ country: "IN" })).toBe("INR");
    expect(currencyFor({ country: "us", timeZone: "Asia/Kolkata" })).toBe(
      "USD",
    );
    expect(currencyFor({ timeZone: "Asia/Kolkata" })).toBe("INR");
    expect(
      currencyFor({ country: "XX", acceptLanguage: "en-IN,en;q=0.9" }),
    ).toBe("INR");
    expect(currencyFor({ acceptLanguage: "en-GB" })).toBe("USD");
    expect(currencyFor({})).toBe("USD");
    expect(PRO_PRICES.INR).toMatchObject({ amount: 29900, display: "₹299" });
    expect(PRO_PRICES.USD).toMatchObject({ amount: 500, display: "$5" });
  });

  it("treats PRO as active only until it ends", () => {
    const now = new Date("2026-11-11T00:00:00Z");
    expect(isProActive(null, now)).toBe(false);
    expect(
      isProActive({ plan: "pro", proUntil: new Date("2026-11-12") }, now),
    ).toBe(true);
    expect(
      isProActive({ plan: "pro", proUntil: new Date("2026-11-10") }, now),
    ).toBe(false);
    expect(isProActive({ plan: "free", proUntil: null }, now)).toBe(false);
  });
});

describe("M9 SQL", () => {
  const list = (kind: string) =>
    new RegExp(
      `TG_ARGV\\[1\\] = '${kind}' THEN\\s+v_pro := v_design = ANY \\(ARRAY\\[([^\\]]*)\\]`,
    ).exec(SQL);
  const ids = (m: RegExpExecArray | null) =>
    m![1]!
      .split(",")
      .map((s) => s.trim().replace(/'/g, ""))
      .sort();

  it("locks exactly the PRO designs the app locks", () => {
    expect(ids(list("card"))).toEqual(
      CARD_DESIGN_IDS.filter(isProCardDesign).sort(),
    );
    const website = /ELSE\s+v_pro := v_design = ANY \(ARRAY\[([^\]]*)\]/.exec(
      SQL,
    );
    expect(ids(website)).toEqual(THEME_IDS.filter(isProWebsiteTheme).sort());
  });

  it("accepts only the app's prices and period", () => {
    for (const [currency, { amount }] of Object.entries(PRO_PRICES)) {
      expect(SQL).toContain(
        `p_currency = '${currency}' AND p_amount = ${amount}`,
      );
      expect(SQL).toContain(`currency = '${currency}' AND amount = ${amount}`);
    }
    expect(SQL).toContain(`p_days <> ${PRO_PERIOD_DAYS}`);
  });

  it("has one SECURITY DEFINER function, bound to auth.uid() and a proof", () => {
    const definers = [
      ...SQL.matchAll(/CREATE FUNCTION (folioone\.\w+)[\s\S]*?\$fn\$;/g),
    ]
      .filter((m) => /SECURITY DEFINER/.test(m[0]))
      .map((m) => m[1]);
    expect(definers).toEqual(["folioone.billing_activate_pro"]);
    const fn =
      /CREATE FUNCTION folioone\.billing_activate_pro[\s\S]*?\$fn\$;/.exec(
        SQL,
      )![0];
    expect(fn).toMatch(/v_uid uuid := auth\.uid\(\)/);
    expect(fn).toMatch(/SET search_path = ''/);
    expect(fn).toMatch(
      /extensions\.hmac\(\s*concat_ws\('\|', v_uid::text, p_order_id, p_payment_id, p_amount::text, p_currency, p_days::text\)/,
    );
    expect(fn).not.toMatch(/p_account|p_user/);
  });

  it("never lets users write PRO and exposes nothing to anon or service_role", () => {
    const executable = SQL.split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(
      /GRANT[^;]*(UPDATE|DELETE)[^;]*TO authenticated/,
    );
    expect(executable).not.toMatch(/GRANT[^;]*TO (anon|service_role|PUBLIC)/);
    expect(executable).toMatch(
      /WITH CHECK \(account_id = \(SELECT auth\.uid\(\)\) AND plan = 'free' AND pro_until IS NULL\)/,
    );
    expect(executable).not.toMatch(/public\./);
    // The secret is generated in the database, never written in the repository.
    expect(
      readFileSync("docs/sql/milestone-9/002-billing-secret.sql", "utf8"),
    ).toMatch(/gen_random_bytes\(32\)/);
  });

  it("is in the local validation package, and the secret file is not", () => {
    const script = readFileSync("scripts/validate/validate.mjs", "utf8");
    expect(script).toContain('"docs/sql/milestone-9/001-pro-plans.sql"');
    expect(script).not.toContain(
      '"docs/sql/milestone-9/002-billing-secret.sql"',
    );
  });
});

describe("Razorpay verification", () => {
  it("checks the Checkout signature and binds the proof to the account", () => {
    const signature = hmac(KEY_SECRET, "order_ABC123|pay_DEF456");
    expect(
      isValidCheckoutSignature({
        orderId: "order_ABC123",
        paymentId: "pay_DEF456",
        signature,
      }),
    ).toBe(true);
    expect(
      isValidCheckoutSignature({
        orderId: "order_ABC123",
        paymentId: "pay_OTHER1",
        signature,
      }),
    ).toBe(false);
    expect(
      entitlementProof({
        accountId: db.user.id,
        orderId: "order_ABC123",
        paymentId: "pay_DEF456",
        amount: 500,
        currency: "USD",
        days: 30,
      }),
    ).toBe(
      hmac(ENTITLEMENT, `${db.user.id}|order_ABC123|pay_DEF456|500|USD|30`),
    );
  });

  function razorpay({
    notes = { account_id: db.user.id, product: "folioone-pro-30d" },
    orderAmount = 29900,
    payment = { status: "captured", amount: 29900, order_id: "order_ABC123" },
  } = {}) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        const body = url.includes("/orders/")
          ? {
              id: "order_ABC123",
              amount: orderAmount,
              currency: "INR",
              status: "paid",
              notes,
            }
          : url.endsWith("/capture")
            ? {
                id: "pay_DEF456",
                currency: "INR",
                ...payment,
                status: "captured",
              }
            : { id: "pay_DEF456", currency: "INR", ...payment };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    return calls;
  }
  const input = {
    orderId: "order_ABC123",
    paymentId: "pay_DEF456",
    signature: hmac(KEY_SECRET, "order_ABC123|pay_DEF456"),
  };

  it("activates PRO only after Razorpay confirms the payment", async () => {
    razorpay();
    await expect(confirmProPayment(input)).resolves.toEqual(
      new Date("2026-12-11"),
    );
    expect(db.activatePro).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        orderId: "order_ABC123",
        paymentId: "pay_DEF456",
        amount: 29900,
        currency: "INR",
        days: 30,
        proof: hmac(
          ENTITLEMENT,
          `${db.user.id}|order_ABC123|pay_DEF456|29900|INR|30`,
        ),
      }),
    );
  });

  it("captures an authorised payment first", async () => {
    const calls = razorpay({
      payment: {
        status: "authorized",
        amount: 29900,
        order_id: "order_ABC123",
      },
    });
    await confirmProPayment(input);
    expect(calls).toContain(
      "POST https://api.razorpay.com/v1/payments/pay_DEF456/capture",
    );
  });

  it.each([
    ["a forged signature", {}, { ...input, signature: "0".repeat(64) }],
    [
      "someone else's order",
      { notes: { account_id: "other", product: "folioone-pro-30d" } },
      input,
    ],
    [
      "an order for another product",
      { notes: { account_id: db.user.id, product: "x" } },
      input,
    ],
    ["a wrong price", { orderAmount: 100 }, input],
    [
      "a failed payment",
      {
        payment: { status: "failed", amount: 29900, order_id: "order_ABC123" },
      },
      input,
    ],
    [
      "a payment for another order",
      {
        payment: {
          status: "captured",
          amount: 29900,
          order_id: "order_ZZZ999",
        },
      },
      input,
    ],
  ])("refuses %s", async (_name, setup, args) => {
    razorpay(setup as Parameters<typeof razorpay>[0]);
    await expect(confirmProPayment(args)).rejects.toBeInstanceOf(
      PaymentVerificationError,
    );
    expect(db.activatePro).not.toHaveBeenCalled();
  });
});

describe("pricing and PRO chrome", () => {
  it("shows the local price and a sign-up path to visitors", () => {
    const { unmount } = render(
      <PricingPlans
        initialCurrency="INR"
        billingReady
        viewer={{ signedIn: false }}
      />,
    );
    expect(screen.getByTestId("pro-price")).toHaveTextContent("₹299");
    expect(
      screen.getByRole("link", { name: "Create an account to upgrade" }),
    ).toHaveAttribute("href", "/signup");
    unmount();
    render(
      <PricingPlans
        initialCurrency="USD"
        billingReady
        viewer={{ signedIn: false }}
      />,
    );
    expect(screen.getByTestId("pro-price")).toHaveTextContent("$5");
  });

  it("offers checkout to Free users and shows PRO users their plan", () => {
    const { unmount } = render(
      <PricingPlans
        initialCurrency="USD"
        billingReady
        viewer={{ signedIn: true, isPro: false, proUntil: null }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Upgrade for $5/month" }),
    ).toBeInTheDocument();
    unmount();
    render(
      <PricingPlans
        initialCurrency="USD"
        billingReady
        viewer={{
          signedIn: true,
          isPro: true,
          proUntil: "2026-12-11T00:00:00Z",
        }}
      />,
    );
    expect(screen.getByText(/You are on PRO until/)).toBeInTheDocument();
  });

  it("writes PRO after the name for PRO users, and offers an upgrade to Free users", () => {
    const { unmount } = render(
      <WorkspaceFrame viewer={{ name: "Priya Natarajan", isPro: true }}>
        x
      </WorkspaceFrame>,
    );
    expect(screen.getAllByLabelText("PRO plan")).toHaveLength(2);
    unmount();
    render(
      <WorkspaceFrame viewer={{ name: "Priya Natarajan", isPro: false }}>
        x
      </WorkspaceFrame>,
    );
    expect(screen.queryByLabelText("PRO plan")).toBeNull();
    expect(screen.getByRole("link", { name: "Upgrade" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });
});
