import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Razorpay (Orders API + Standard Checkout), server side only. Plain fetch, no SDK.
 *
 *   RAZORPAY_KEY_ID              public key id (also sent to the browser to open Checkout)
 *   RAZORPAY_KEY_SECRET          server-only; signs/verifies payments with Razorpay
 *   FOLIOONE_ENTITLEMENT_SECRET  server-only; signs the "this payment is verified" proof that
 *                                folioone.billing_activate_pro checks (same value is stored once
 *                                in folioone.billing_secrets by the developer). Never the
 *                                Razorpay secret, never NEXT_PUBLIC_.
 */

const API = "https://api.razorpay.com/v1";

export class BillingUnavailableError extends Error {
  constructor() {
    super("Payments are not available right now.");
    this.name = "BillingUnavailableError";
  }
}

export class RazorpayRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super("The payment provider could not complete the request.");
    this.name = "RazorpayRequestError";
  }
}

function config() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const entitlementSecret = process.env.FOLIOONE_ENTITLEMENT_SECRET?.trim();
  if (
    !keyId ||
    !keySecret ||
    !entitlementSecret ||
    entitlementSecret.length < 32
  )
    throw new BillingUnavailableError();
  return { keyId, keySecret, entitlementSecret };
}

export function isBillingConfigured(): boolean {
  try {
    config();
    return true;
  } catch {
    return false;
  }
}

export function razorpayKeyId(): string {
  return config().keyId;
}

async function call<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: { method: "POST"; body: unknown },
): Promise<T> {
  const { keyId, keySecret } = config();
  const response = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...(init ? { "Content-Type": "application/json" } : {}),
    },
    body: init ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (json as { error?: { code?: string } } | null)?.error?.code;
    throw new RazorpayRequestError(response.status, code);
  }
  return schema.parse(json);
}

const orderSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  notes: z
    .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .optional(),
});
export type RazorpayOrder = z.infer<typeof orderSchema>;

const paymentSchema = z.object({
  id: z.string().min(1),
  order_id: z.string().nullable().optional(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
});
export type RazorpayPayment = z.infer<typeof paymentSchema>;

export function createOrder(input: {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  return call("/orders", orderSchema, { method: "POST", body: input });
}

export function fetchOrder(orderId: string): Promise<RazorpayOrder> {
  return call(`/orders/${encodeURIComponent(orderId)}`, orderSchema);
}

export function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return call(`/payments/${encodeURIComponent(paymentId)}`, paymentSchema);
}

/** Only needed when the Razorpay account does not auto-capture payments. */
export function capturePayment(
  paymentId: string,
  amount: number,
  currency: string,
): Promise<RazorpayPayment> {
  return call(
    `/payments/${encodeURIComponent(paymentId)}/capture`,
    paymentSchema,
    { method: "POST", body: { amount, currency } },
  );
}

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout's success signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
export function isValidCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = config();
  return safeEqualHex(
    hmacHex(keySecret, `${input.orderId}|${input.paymentId}`),
    input.signature.trim().toLowerCase(),
  );
}

/**
 * Proof for folioone.billing_activate_pro, computed only AFTER the payment was verified with
 * Razorpay. It binds the signed-in account, so it is useless to anyone else. Must match the
 * SQL: hmac(account|order|payment|amount|currency|days, secret, 'sha256') as hex.
 */
export function entitlementProof(input: {
  accountId: string;
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  days: number;
}): string {
  const { entitlementSecret } = config();
  return hmacHex(
    entitlementSecret,
    [
      input.accountId,
      input.orderId,
      input.paymentId,
      String(input.amount),
      input.currency,
      String(input.days),
    ].join("|"),
  );
}
