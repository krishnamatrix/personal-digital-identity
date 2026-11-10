import Link from "next/link";
import type { ReactNode } from "react";

export function AuthCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="border-border bg-card w-full max-w-md rounded-lg border p-7 md:p-9">
        <Link href="/" className="font-serif text-2xl tracking-tight">
          folioone<span className="text-[#c88c68]">.</span>
        </Link>
        <p className="text-accent mt-10 text-xs font-semibold tracking-[.14em] uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-serif text-3xl">{title}</h1>
        <p className="text-muted-foreground mt-2 mb-7 text-sm leading-6">
          {description}
        </p>
        {children}
      </section>
    </main>
  );
}

export function FormField({
  id,
  label,
  error,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="border-border bg-card placeholder:text-muted-foreground focus-visible:ring-accent h-10 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
