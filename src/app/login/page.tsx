import Link from "next/link";
import { LoginForm } from "@/app/login/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="border-border bg-card w-full max-w-md rounded-lg border p-7 md:p-9">
        <Link href="/" className="font-serif text-2xl tracking-tight">
          folioone<span className="text-[#c88c68]">.</span>
        </Link>
        <p className="text-accent mt-10 text-xs font-semibold tracking-[.14em] uppercase">
          Your private workspace
        </p>
        <h1 className="mt-2 font-serif text-3xl">Welcome back</h1>
        <p className="text-muted-foreground mt-2 mb-7 text-sm leading-6">
          Sign in to continue shaping your identity.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
