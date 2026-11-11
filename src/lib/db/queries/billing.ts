import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import { AuthorizationError } from "@/lib/supabase/server";
import type { BillingCurrency, Plan } from "@/domains/billing/plans";

export class BillingPersistenceError extends Error {
  /** PostgREST / Postgres error code, kept for logs only (never shown to users). */
  readonly code?: string;
  constructor(code?: string) {
    super("We could not update your plan. Please contact support.");
    this.name = "BillingPersistenceError";
    this.code = code;
  }
}

/** This payment was already used to activate PRO on another account. */
export class PaymentAlreadyUsedError extends Error {
  constructor() {
    super("This payment has already been used.");
    this.name = "PaymentAlreadyUsedError";
  }
}

function mapError(error: { code?: string }): Error {
  if (error.code === "23505") return new PaymentAlreadyUsedError();
  if (error.code === "42501" || error.code === "PGRST301")
    return new AuthorizationError();
  return new BillingPersistenceError(error.code);
}

export type PlanRow = { plan: Plan; proUntil: Date | null };

/** The signed-in account's plan row (RLS: own row only). No row means Free. */
export async function findPlan(
  client: FolioneClient,
  userId: string,
): Promise<PlanRow | null> {
  const { data, error } = await client
    .from("account_plans")
    .select("plan,pro_until")
    .eq("account_id", userId)
    .maybeSingle();
  if (error) throw mapError(error);
  if (!data) return null;
  return {
    plan: data.plan === "pro" ? "pro" : "free",
    proUntil: data.pro_until ? new Date(String(data.pro_until)) : null,
  };
}

/**
 * Records a VERIFIED Razorpay payment and extends PRO for the caller (auth.uid()). The
 * database checks `proof` (see src/lib/billing/razorpay.ts entitlementProof) before writing;
 * repeating the same payment returns the same end date.
 */
export async function activatePro(
  client: FolioneClient,
  args: {
    orderId: string;
    paymentId: string;
    amount: number;
    currency: BillingCurrency;
    days: number;
    proof: string;
  },
): Promise<Date> {
  const { data, error } = await client.rpc("billing_activate_pro", {
    p_order_id: args.orderId,
    p_payment_id: args.paymentId,
    p_amount: args.amount,
    p_currency: args.currency,
    p_days: args.days,
    p_proof: args.proof,
  });
  if (error) throw mapError(error);
  return new Date(String(data));
}
