/**
 * Booking block: which scheduling pages can be shown inside the website, and how. Pure.
 *
 * Embedded only for providers whose booking pages are designed to be framed; anything else is
 * shown as a "Book a time" button that opens the page in a new tab. Embeds load only after the
 * visitor clicks (see booking-block.tsx), so no third-party script runs on page load.
 */
export type BookingProvider = "calendly" | "cal" | "google" | "other";

export type BookingLink = {
  provider: BookingProvider;
  providerLabel: string;
  /** The page visitors are sent to (always https). */
  url: string;
  /** iframe src, when the provider supports embedding. */
  embedUrl?: string;
};

const LABEL: Record<BookingProvider, string> = {
  calendly: "Calendly",
  cal: "Cal.com",
  google: "Google Calendar",
  other: "Booking page",
};

export function parseBookingLink(
  raw: string | null | undefined,
): BookingLink | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  url.hash = "";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  const clean = url.toString();

  if (host === "calendly.com" && path.split("/").filter(Boolean).length >= 1) {
    const embed = new URL(clean);
    embed.searchParams.set("embed_type", "Inline");
    embed.searchParams.set("hide_gdpr_banner", "1");
    return {
      provider: "calendly",
      providerLabel: LABEL.calendly,
      url: clean,
      embedUrl: embed.toString(),
    };
  }
  if (
    (host === "cal.com" || host === "app.cal.com") &&
    path.split("/").filter(Boolean).length >= 1
  ) {
    return {
      provider: "cal",
      providerLabel: LABEL.cal,
      url: clean,
      embedUrl: clean,
    };
  }
  if (
    host === "calendar.google.com" &&
    /^\/calendar\/appointments\/schedules\/[A-Za-z0-9_-]+$/.test(path)
  ) {
    const embed = new URL(clean);
    embed.searchParams.set("gv", "true");
    return {
      provider: "google",
      providerLabel: LABEL.google,
      url: clean,
      embedUrl: embed.toString(),
    };
  }
  return { provider: "other", providerLabel: LABEL.other, url: clean };
}
