/**
 * Coarse, privacy-friendly classification of a user agent. Only these labels are stored, never
 * the user agent string itself. Pure.
 */

const BOT =
  /bot|crawl|spider|slurp|preview|fetch|scrape|headless|lighthouse|pagespeed|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|quora link|pinterest|vkshare|w3c_validator|curl|wget|python|httpclient|axios|node-fetch|go-http|java\//i;

export function isBot(ua: string | null | undefined): boolean {
  return !ua || ua.length < 10 || BOT.test(ua);
}

export type Device = "mobile" | "tablet" | "desktop";

export function deviceOf(ua: string): Device {
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua))
    return "tablet";
  if (
    /mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i.test(
      ua,
    )
  )
    return "mobile";
  return "desktop";
}

export function browserOf(ua: string): string {
  if (/edg(e|a|ios)?\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/linkedinapp/i.test(ua)) return "LinkedIn app";
  if (/instagram/i.test(ua)) return "Instagram app";
  if (/fban|fbav/i.test(ua)) return "Facebook app";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/chrome|crios|crmo/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return "Other";
}

export function osOf(ua: string): string {
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Other";
}
