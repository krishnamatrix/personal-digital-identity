import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, safeNextPath } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const OTP_TYPES = [
  "signup",
  "email",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
] as const;
type OtpType = (typeof OTP_TYPES)[number];
const isOtpType = (v: string | null): v is OtpType =>
  (OTP_TYPES as readonly string[]).includes(v ?? "");

/**
 * Landing point for Supabase email links (sign-up confirmation, password reset).
 * Supports both the PKCE `?code=` link and the `?token_hash=&type=` link, so the flow also
 * works when the email is opened on another device.
 */
export async function GET(request: NextRequest) {
  const site = await getSiteUrl();
  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const next = safeNextPath(
    params.get("next"),
    type === "recovery" ? "/reset-password" : "/onboarding",
  );
  const failure = new URL(
    type === "recovery" ? "/forgot-password" : "/login",
    site,
  );
  failure.searchParams.set("error", "link_invalid");

  try {
    const supabase = await createClient();
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, site));
    } else if (tokenHash && isOtpType(type)) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) return NextResponse.redirect(new URL(next, site));
    }
  } catch {
    // fall through to the generic failure redirect
  }
  return NextResponse.redirect(failure);
}
