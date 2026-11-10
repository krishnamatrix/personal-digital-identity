import Link from "next/link";

export default function SiteNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-accent text-xs font-semibold tracking-[.14em] uppercase">
        404
      </p>
      <h1 className="mt-3 font-serif text-4xl">
        This page isn&apos;t available
      </h1>
      <p className="text-muted-foreground mt-3 max-w-md text-sm leading-6">
        The address may be mistyped, or the owner has not published it (or has
        taken it down).
      </p>
      <Link
        href="/"
        className="text-accent mt-6 text-sm underline underline-offset-4"
      >
        Go to Folioone
      </Link>
    </main>
  );
}
