import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";
import { z } from "zod";
import {
  guessMediaType,
  youtubeThumbnail,
  youtubeVideoId,
  type FeaturedMediaType,
} from "@/domains/featured/featured-link";

/**
 * Reads a public web page's preview data (Open Graph / Twitter tags) for "Fill from link".
 *
 * The server fetches a URL the user typed, so it is guarded against SSRF:
 *   - https only, default port only, no credentials in the URL;
 *   - every DNS answer is checked at CONNECT time (custom lookup), so private, loopback,
 *     link-local, CGNAT, multicast and reserved addresses are refused, including after a
 *     redirect and against DNS rebinding;
 *   - at most 3 redirects, 6 s per request, 512 KB of HTML, text/html only.
 * Nothing fetched is stored except the fields returned to the owner's own editor.
 */

export type LinkPreview = {
  title?: string;
  summary?: string;
  thumbnailUrl?: string;
  date?: string; // YYYY-MM
  mediaType: FeaturedMediaType;
};

export class LinkPreviewError extends Error {
  constructor(readonly reason: "invalid" | "blocked" | "unreadable") {
    super(
      reason === "invalid"
        ? "Enter a full https link."
        : reason === "blocked"
          ? "That address cannot be fetched."
          : "We could not read details from that page. Fill them in yourself.",
    );
    this.name = "LinkPreviewError";
  }
}

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;
const USER_AGENT =
  "Mozilla/5.0 (compatible; FoliooneLinkPreview/1.0; +https://folioone.com)";

function ipv4Public(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number) as [number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

/** True only for globally routable unicast addresses. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return ipv4Public(ip);
  if (family !== 6) return false;
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return ipv4Public(mapped[1]!);
  if (v6 === "::" || v6 === "::1") return false;
  if (/^f[cd]/.test(v6)) return false; // unique local fc00::/7
  if (/^fe[89ab]/.test(v6)) return false; // link-local fe80::/10
  if (v6.startsWith("ff")) return false; // multicast
  if (v6.startsWith("2001:db8") || v6.startsWith("64:ff9b")) return false;
  return true;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

function safeLookup(
  hostname: string,
  options: { all?: boolean },
  callback: LookupCallback,
) {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as LookupAddress[];
    if (list.length === 0 || !list.every((a) => isPublicAddress(a.address))) {
      const blocked = new Error("blocked address") as NodeJS.ErrnoException;
      blocked.code = "EBLOCKED";
      return callback(blocked, "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LinkPreviewError("invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new LinkPreviewError("invalid");
  if (url.port && url.port !== "443") throw new LinkPreviewError("blocked");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host))
    throw new LinkPreviewError("blocked");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  )
    throw new LinkPreviewError("blocked");
  return url;
}

function fetchOnce(
  url: URL,
): Promise<{ status: number; location?: string; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({
            status,
            location: res.headers.location,
            type,
            body: "",
          });
        }
        if (status !== 200 || !/text\/html|application\/xhtml/i.test(type)) {
          res.resume();
          return resolve({ status, type, body: "" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("close", () =>
          resolve({
            status,
            type,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchHtml(start: URL): Promise<{ url: URL; html: string }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await fetchOnce(url);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new LinkPreviewError(
        code === "EBLOCKED" ? "blocked" : "unreadable",
      );
    }
    if (res.location) {
      url = checkUrl(new URL(res.location, url).toString());
      continue;
    }
    if (!res.body) throw new LinkPreviewError("unreadable");
    return { url, html: res.body };
  }
  throw new LinkPreviewError("unreadable");
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Open Graph / Twitter / standard meta tags, first value wins. Pure: exported for tests. */
export function parseMeta(html: string): Record<string, string> {
  const head = html.slice(0, 200_000);
  const meta: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
    const key = attr("property") ?? attr("name") ?? attr("itemprop");
    const content = attr("content");
    if (!key || !content) continue;
    const k = (key[2] ?? key[3] ?? "").toLowerCase();
    const v = decode(content[2] ?? content[3] ?? "");
    if (k && v && !(k in meta)) meta[k] = v;
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  if (title && !meta["title"]) meta["title"] = decode(title[1] ?? "");
  return meta;
}

const httpsUrl = z
  .url()
  .max(2000)
  .regex(/^https:\/\//);

/** Turns meta tags into preview fields. Pure: exported for tests. */
export function previewFromMeta(
  meta: Record<string, string>,
  pageUrl: string,
): LinkPreview {
  const pick = (...keys: string[]) =>
    keys.map((k) => meta[k]).find((v) => v && v.length > 0);
  const title = pick("og:title", "twitter:title", "title")?.slice(0, 200);
  const summary = pick(
    "og:description",
    "twitter:description",
    "description",
  )?.slice(0, 400);
  const rawImage = pick(
    "og:image:secure_url",
    "og:image",
    "twitter:image",
    "twitter:image:src",
  );
  let thumbnailUrl: string | undefined;
  if (rawImage) {
    try {
      const abs = new URL(rawImage, pageUrl).toString();
      if (httpsUrl.safeParse(abs).success) thumbnailUrl = abs;
    } catch {
      /* ignore */
    }
  }
  const published = pick(
    "article:published_time",
    "og:article:published_time",
    "datepublished",
    "uploaddate",
  );
  const date =
    published && /^\d{4}-\d{2}/.test(published)
      ? published.slice(0, 7)
      : undefined;
  const ogType = (meta["og:type"] ?? "").toLowerCase();
  const mediaType: FeaturedMediaType = ogType.startsWith("video")
    ? "video"
    : ogType === "article"
      ? "article"
      : guessMediaType(pageUrl);
  return { title, summary, thumbnailUrl, date, mediaType };
}

const oembedSchema = z.object({ title: z.string().max(500).optional() });

async function youtubePreview(url: string, id: string): Promise<LinkPreview> {
  let title: string | undefined;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (res.ok)
      title = oembedSchema.parse(await res.json()).title?.slice(0, 200);
  } catch {
    /* the thumbnail alone is still useful */
  }
  return { title, thumbnailUrl: youtubeThumbnail(id), mediaType: "video" };
}

export async function fetchLinkPreview(raw: string): Promise<LinkPreview> {
  const url = checkUrl(raw.trim());
  const videoId = youtubeVideoId(url.toString());
  if (videoId) return youtubePreview(url.toString(), videoId);
  const { url: finalUrl, html } = await fetchHtml(url);
  const preview = previewFromMeta(parseMeta(html), finalUrl.toString());
  if (!preview.title && !preview.thumbnailUrl)
    throw new LinkPreviewError("unreadable");
  return preview;
}
