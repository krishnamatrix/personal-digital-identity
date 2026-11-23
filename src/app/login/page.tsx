import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/app/login/login-form";
import { returnPathAfterAuth } from "@/lib/site-url";

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  password_updated: {
    tone: "ok",
    text: "Your password was updated. Sign in with the new password.",
  },
  link_invalid: {
    tone: "error",
    text: "That confirmation link is invalid or has expired. Sign in, or create the account again.",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string; next?: string }>;
}) {
  const { message, error, next } = await searchParams;
  const notice = NOTICES[message ?? error ?? ""];
  return (
    <AuthCard
      eyebrow="Your private workspace"
      title="Welcome back"
      description="Sign in to continue shaping your identity."
    >
      {notice && (
        <p
          className={`mb-5 rounded-md border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}
          role={notice.tone === "ok" ? "status" : "alert"}
        >
          {notice.text}
        </p>
      )}
      <LoginForm next={returnPathAfterAuth(next)} />
    </AuthCard>
  );
}
