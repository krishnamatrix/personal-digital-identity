import type { Metadata } from "next";
import { logLoadError } from "@/lib/server-log";
import Link from "next/link";
import { SiteView } from "@/components/website/site-view";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { getPreview } from "@/domains/website/website-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Website preview",
  robots: { index: false, follow: false },
};

/** Owner-only preview of the SAVED draft over the CURRENT My Identity. Viewing never publishes. */
export default async function WebsitePreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ?theme= previews the saved draft in another design (picker "Preview"); never saved.
  const requested = (await searchParams).theme;
  let preview;
  try {
    preview = await getPreview(
      typeof requested === "string" ? requested : undefined,
    );
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("/website/preview", error);
    return (
      <main className="p-10 text-center text-sm">
        {error instanceof AuthenticationRequiredError ? (
          <>
            Sign in to preview your website.{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </>
        ) : (
          "We could not load the preview."
        )}
      </main>
    );
  }
  if (!preview)
    return (
      <main className="p-10 text-center text-sm">
        Choose your website address first, then come back to preview.
      </main>
    );
  return (
    <>
      <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">
        Preview. Only you can see this. Nothing here is public until you
        publish.
      </div>
      <SiteView theme={preview.theme} content={preview.content} />
    </>
  );
}
