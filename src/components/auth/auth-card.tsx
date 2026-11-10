import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
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
    <main className="bg-sidebar flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <section className="border-border bg-card w-full max-w-md rounded-[28px] border p-7 shadow-[0_1px_3px_rgba(0,0,0,.04),0_12px_40px_-12px_rgba(0,0,0,.12)] md:p-10">
        <Link href="/" className="rounded-full">
          <BrandMark />
        </Link>
        <p className="eyebrow mt-10">{eyebrow}</p>
        <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
          {title}
        </h1>
        <p className="text-muted-foreground mt-2 mb-7 text-sm leading-6">
          {description}
        </p>
        {children}
      </section>
      <p className="text-muted-foreground mt-6 flex items-center gap-2 text-[13px]">
        <span aria-hidden="true" className="bg-success size-2 rounded-full" />
        Private by default — nothing is shared until you choose
      </p>
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
        className="border-border bg-card placeholder:text-muted-foreground focus-visible:ring-foreground/15 focus-visible:border-foreground/30 h-11 w-full rounded-md border px-3.5 text-sm outline-none focus-visible:ring-2"
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
