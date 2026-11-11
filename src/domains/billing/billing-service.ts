import "server-only";
import { headers } from "next/headers";
import {
  activatePro,
  ensureAccount,
  findPlan,
  getAuthenticatedDb,
  type DbClient,
} from "@/lib/db/query";
import {
  capturePayment,
  createOrder,
  entitlementProof,
  fetchOrder,
  fetchPayment,
  isValidCheckoutSignature,
  razorpayKeyId,
} from "@/lib/billing/razorpay";
import {
  currencyFor,
  isProActive,
  PRO_PERIOD_DAYS,
  PRO_PRICES,
  type BillingCurrency,
} from "./plans";

/** Marks orders this app created for PRO, so no other Razorpay order can activate it. */
const PRODUCT = "folioone-pro-30d";

export class PaymentVerificationError extends Error {
  constructor(readonly reason: string) {
    super("We could not verify this payment.");
    this.name = "PaymentVerificationError";
  }
}

/** PRO is active for the verified user (their own plan row, read through RLS). */
export async function hasActivePro(
  client: DbClient,
  userId: string,
): Promise<boolean> {
  return isProActive(await findPlan(client, userId));
}

export async function getMyPlan(): Promise<{
  isPro: boolean;
  proUntil: string | null;
}> {
  const { client, user } = await getAuthenticatedDb();
  const plan = await findPlan(client, user.id);
  const isPro = isProActive(plan);
  return {
    isPro,
    proUntil: isPro ? (plan?.proUntil?.toISOString() ?? null) : null,
  };
}

/** Currency for this request: CDN/host country header, then browser hints. */
export async function requestCurrency(
  timeZone?: string | null,
): Promise<BillingCurrency> {
  const h = await headers();
  return currencyFor({
    country:
      h.get("cf-ipcountry") ??
      h.get("x-vercel-ip-country") ??
      h.get("x-country-code"),
    timeZone,
    acceptLanguage: h.get("accept-language"),
  });
}

export type ProCheckout = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: BillingCurrency;
  email: string | null;
};

/** Creates a Razorpay order for 30 days of PRO for the signed-in user. */
export async function startProCheckout(
  timeZone?: string | null,
): Promise<ProCheckout> {
  const { user } = await getAuthenticatedDb();
  const currency = await requestCurrency(timeZone);
  const { amount } = PRO_PRICES[currency];
  const order = await createOrder({
    amount,
    currency,
    receipt: `pro-${Date.now().toString(36)}`,
    notes: { account_id: user.id, product: PRODUCT },
  });
  return {
    keyId: razorpayKeyId(),
    orderId: order.id,
    amount,
    currency,
    email: user.email ?? null,
  };
}

const ID = /^[A-Za-z0-9_]{6,64}$/;

/**
 * Verifies a completed Checkout with Razorpay and, only then, extends PRO. Checks: the
 * Checkout signature, that the order is ours, for THIS account and for a PRO price, and that
 * the payment belongs to the order with the same amount and is captured.
 */
export async function confirmProPayment(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<Date> {
  const orderId = String(input.orderId ?? "");
  const paymentId = String(input.paymentId ?? "");
  const signature = String(input.signature ?? "");
  if (
    !ID.test(orderId) ||
    !ID.test(paymentId) ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    throw new PaymentVerificationError("malformed");

  const { client, user } = await getAuthenticatedDb();
  if (!isValidCheckoutSignature({ orderId, paymentId, signature }))
    throw new PaymentVerificationError("signature");

  const order = await fetchOrder(orderId);
  const notes = Array.isArray(order.notes) ? {} : (order.notes ?? {});
  if (notes.account_id !== user.id || notes.product !== PRODUCT)
    throw new PaymentVerificationError("order_owner");
  const currency = order.currency as BillingCurrency;
  if (!(currency in PRO_PRICES) || order.amount !== PRO_PRICES[currency].amount)
    throw new PaymentVerificationError("order_amount");

  let payment = await fetchPayment(paymentId);
  if (
    payment.order_id !== orderId ||
    payment.amount !== order.amount ||
    payment.currency !== currency
  )
    throw new PaymentVerificationError("payment_mismatch");
  if (payment.status === "authorized")
    payment = await capturePayment(paymentId, order.amount, currency);
  if (payment.status !== "captured")
    throw new PaymentVerificationError(`payment_${payment.status}`);

  await ensureAccount(client, user.id);
  return activatePro(client, {
    orderId,
    paymentId,
    amount: order.amount,
    currency,
    days: PRO_PERIOD_DAYS,
    proof: entitlementProof({
      accountId: user.id,
      orderId,
      paymentId,
      amount: order.amount,
      currency,
      days: PRO_PERIOD_DAYS,
    }),
  });
}
