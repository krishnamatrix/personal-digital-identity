import Link from "next/link";

export default function CardNotFound() {
  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow">Digital card</p>
      <h1 className="font-display mt-4 text-3xl">This card is not available</h1>
      <p className="text-muted-foreground mt-3 max-w-sm text-[15px]">
        The link may be mistyped, or its owner has taken the card down.
      </p>
      <Link href="/" className="mt-8 text-sm underline underline-offset-4">
        Go to Folioone
      </Link>
    </main>
  );
}
