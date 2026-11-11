# M9: Free and PRO plans (Razorpay)

## What users see

- **Landing page** (`/`, signed out): a Pricing section (Free vs PRO) and a "Pricing" link in the header.
- **Pricing page** (`/pricing`): the same plans; inside the workspace when signed in. `?from=cards|website` explains
  which locked design brought the person there.
- **Locked designs**: in My Website → Design and Digital Cards → Design, PRO designs carry a lock badge. Clicking one
  opens `/pricing`. Previewing a locked website design stays possible. A PRO design that is already saved stays usable.
- **Upgrade**: "Upgrade for ₹299/month" (India) or "$5/month" (elsewhere) opens Razorpay Checkout. After payment the
  server verifies it, then `/pricing/success` says "You are now a PRO user." and links to the designs.
- **PRO mark**: a "PRO" superscript after the person's name in the header and in the sidebar card ("PRO workspace").
  Free users see "Free plan · Upgrade" in the sidebar card and "Upgrade to PRO" in the account menu.

Free designs: websites `professional`, `creative`, `minimal`, `linen`; cards `ivory`, `slate`, `graphite`, `linen`,
`coastal`, `mint` (`src/domains/billing/plans.ts`, repeated in the SQL; a test keeps them equal).

## Pricing currency

`currencyFor` (`plans.ts`): a CDN/host country header (`cf-ipcountry`, `x-vercel-ip-country`, `x-country-code`) when
present, otherwise the browser time zone (`Asia/Kolkata` → INR), otherwise an `-IN` language region. India → INR,
everyone else → USD. Railway sets no country header, so the time zone is the usual signal. The server makes this decision
again when it creates the order, so the amount charged always matches a published price.

## Payment flow

1. `startCheckoutAction` → `startProCheckout`: verifies the session, picks the currency, and creates a Razorpay order
   (Orders API) with `notes = { account_id, product: "folioone-pro-30d" }`.
2. The browser loads `checkout.razorpay.com/v1/checkout.js` on demand and opens Checkout for that order.
3. On success, `confirmPaymentAction` → `confirmProPayment` checks:
   - the Checkout signature (`HMAC(order|payment, key_secret)`, constant-time comparison);
   - that the order has this account's id and our product, and that its amount is a PRO price;
   - that the payment belongs to that order, has the same amount and currency, and is captured (an `authorized`
     payment is captured first).
4. Only then does the server compute the entitlement proof and call `folioone.billing_activate_pro` (AD-011), which
   extends `pro_until` by 30 days from today or from the current end date, whichever is later.

Each payment is one month of PRO, with no automatic renewal. A PRO user can add 30 more days from the pricing page.
There are no webhooks. If the browser closes between payment and confirmation, the payment exists in Razorpay but PRO
is not activated; the developer checks Razorpay and resolves it with a refund or by hand. Uncaptured (authorized-only)
payments are refunded by Razorpay automatically.

## Enforcement

- **App**: `saveMyCardDraft` / `saveWebsiteDraft` refuse switching to a PRO design, and `publishMyCard` /
  `publishWebsite` refuse publishing one, for Free accounts (`ProRequiredError`, which the UI shows with a
  "See PRO plans" link).
- **Database**: the `enforce_pro_design` triggers do the same for direct API calls (SQLSTATE `PT402`, mapped to
  `ProRequiredError`). When PRO lapses, live pages stay up; publishing again needs PRO or a free design.

## Setup (developer)

1. Run `docs/sql/milestone-9/001-pro-plans.sql` (after M5–M8), then `002-billing-secret.sql`; copy the secret it prints.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (start with test keys) and `FOLIOONE_ENTITLEMENT_SECRET` on the server.
3. For USD payments, enable International Payments in the Razorpay dashboard.
4. To see who is Free and who is PRO, run the commented query at the end of `001-pro-plans.sql`.
