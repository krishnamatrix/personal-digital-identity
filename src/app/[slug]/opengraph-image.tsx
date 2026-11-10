import { ImageResponse } from "next/og";
import { getPublicSite } from "@/domains/website/website-service";
import { themeColors } from "@/domains/website/config";

export const alt = "Personal website";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/**
 * Typographic card from the PUBLISHED content only. Profile images are deliberately not
 * fetched here: the server would have to download an arbitrary user-supplied URL.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let site = null;
  try {
    site = await getPublicSite(slug);
  } catch {
    site = null;
  }
  const c = themeColors(site?.theme ?? "professional");
  const person = site?.content.person;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: c.bg,
          color: c.fg,
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            fontSize: 28,
            color: c.accent,
            letterSpacing: 4,
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          {person?.role ?? "Personal website"}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, lineHeight: 1.05, display: "flex" }}>
            {person?.name ?? "Folioone"}
          </div>
          {person?.headline && (
            <div
              style={{
                fontSize: 40,
                marginTop: 24,
                opacity: 0.75,
                display: "flex",
              }}
            >
              {person.headline.slice(0, 110)}
            </div>
          )}
        </div>
        <div style={{ fontSize: 28, color: c.accent, display: "flex" }}>
          {site ? `/${site.slug}` : "Folioone"}
        </div>
      </div>
    ),
    size,
  );
}
