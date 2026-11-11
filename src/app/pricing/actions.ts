"use server";

import { revalidatePath } from "next/cache";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import {
  confirmProPayment,
  PaymentVerificationError,
  requestCurrency,
  startProCheckout,
  type ProCheckout,
} from "@/domains/billing/billing-service";
import { PaymentAlreadyUsedError } from "@/lib/db/query";
import { BillingUnavailableError } from "@/lib/billing/razorpay";
import type { BillingCurrency } from "@/domains/billing/plans";
import { logLoadError } from "@/lib/server-log";

type Failure = { ok: false; message: string; signIn?: boolean };

function failure(action: string, error: unknown): Failure {
  if (error instanceof AuthenticationRequiredError)
    return {
      ok: false,
      signIn: true,
      message: "Sign in to upgrade to PRO.",
    };
  if (error instanceof BillingUnavailableError)
    return {
      ok: false,
      message: "Payments are not available yet. Please try again later.",
    };
  logLoadError(action, error);
  if (error instanceof PaymentAlreadyUsedError)
    return {
      ok: false,
      message:
        "This payment has already been used. Contact support if you think this is wrong.",
    };
  if (error instanceof PaymentVerificationError)
    return {
      ok: false,
      message:
        "We could not confirm your payment. If you were charged, contact support with the payment ID below and we will sort it out.",
    };
  return {
    ok: false,
    message: "Something went wrong with the payment. Please try again.",
  };
}

/** Currency for the visitor, refined with the browser's time zone. */
export async function pricingCurrencyAction(
  timeZone: string,
): Promise<BillingCurrency> {
  return requestCurrency(String(timeZone ?? "").slice(0, 64));
}

export async function startCheckoutAction(
  timeZone: string,
): Promise<({ ok: true } & ProCheckout) | Failure> {
  try {
    return {
      ok: true,
      ...(await startProCheckout(String(timeZone ?? "").slice(0, 64))),
    };
  } catch (error) {
    return failure("billing:checkout", error);
  }
}

export async function confirmPaymentAction(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<{ ok: true; proUntil: string } | Failure> {
  try {
    const until = await confirmProPayment({
      orderId: String(input?.orderId ?? ""),
      paymentId: String(input?.paymentId ?? ""),
      signature: String(input?.signature ?? ""),
    });
    revalidatePath("/", "layout");
    return { ok: true, proUntil: until.toISOString() };
  } catch (error) {
    return failure("billing:confirm", error);
  }
}
