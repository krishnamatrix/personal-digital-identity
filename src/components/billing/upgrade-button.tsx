"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  confirmPaymentAction,
  startCheckoutAction,
} from "@/app/pricing/actions";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type RazorpayInstance = {
  open(): void;
  on(
    event: "payment.failed",
    cb: (r: { error?: { description?: string } }) => void,
  ): void;
};
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("checkout_script"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

/**
 * Opens Razorpay Checkout for 30 days of PRO. The order is created on the server; after
 * payment the server verifies it with Razorpay before anything changes, then we show the
 * confirmation page.
 */
export function UpgradeButton({
  children = "Upgrade to PRO",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "confirming">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setError(null);
    setState("starting");
    const checkout = await startCheckoutAction(browserTimeZone());
    if (!checkout.ok) {
      setState("idle");
      if (checkout.signIn) router.push("/login");
      else setError(checkout.message);
      return;
    }
    try {
      await loadCheckout();
    } catch {
      setState("idle");
      setError(
        "The payment window could not load. Check your connection or ad blocker and try again.",
      );
      return;
    }
    const rzp = new window.Razorpay!({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: "Folioone",
      description: "Folioone PRO · 30 days",
      prefill: checkout.email ? { email: checkout.email } : undefined,
      theme: { color: "#1d1d1f" },
      modal: { ondismiss: () => setState("idle") },
      handler: async (response: RazorpaySuccess) => {
        setState("confirming");
        const result = await confirmPaymentAction({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
        if (result.ok) {
          router.push("/pricing/success");
          router.refresh();
        } else {
          setState("idle");
          setError(
            `${result.message} (Payment ID: ${response.razorpay_payment_id})`,
          );
        }
      },
    });
    rzp.on("payment.failed", (r) => {
      setError(
        r.error?.description
          ? `Payment failed: ${r.error.description}`
          : "Payment failed. Please try again or use another method.",
      );
    });
    rzp.open();
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={upgrade}
        disabled={state !== "idle"}
        className={className}
      >
        {state !== "idle" && (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        )}
        {state === "confirming" ? "Confirming payment…" : children}
      </Button>
      {error && (
        <p role="alert" className="text-danger text-sm leading-5">
          {error}
        </p>
      )}
    </div>
  );
}
