/**
 * Featured posts: recognising where a link points (platform, YouTube video id) so the website
 * can label it, build a video player, and pick the right call to action. Pure; no network.
 */

export type FeaturedPlatform =
  | "linkedin"
  | "x"
  | "youtube"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "medium"
  | "substack"
  | "github"
  | "vimeo"
  | "spotify"
  | "apple_podcasts"
  | "dribbble"
  | "behance"
  | "web";

const PLATFORMS: { id: FeaturedPlatform; label: string; hosts: string[] }[] = [
  { id: "linkedin", label: "LinkedIn", hosts: ["linkedin.com", "lnkd.in"] },
  { id: "x", label: "X", hosts: ["x.com", "twitter.com"] },
  { id: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { id: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { id: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.watch"] },
  { id: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { id: "medium", label: "Medium", hosts: ["medium.com"] },
  { id: "substack", label: "Substack", hosts: ["substack.com"] },
  { id: "github", label: "GitHub", hosts: ["github.com"] },
  { id: "vimeo", label: "Vimeo", hosts: ["vimeo.com"] },
  { id: "spotify", label: "Spotify", hosts: ["open.spotify.com"] },
  {
    id: "apple_podcasts",
    label: "Apple Podcasts",
    hosts: ["podcasts.apple.com"],
  },
  { id: "dribbble", label: "Dribbble", hosts: ["dribbble.com"] },
  { id: "behance", label: "Behance", hosts: ["behance.net"] },
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const matches = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

export function detectPlatform(url: string): {
  id: FeaturedPlatform;
  label: string;
} {
  const host = hostOf(url);
  if (host) {
    for (const p of PLATFORMS)
      if (p.hosts.some((h) => matches(host, h)))
        return { id: p.id, label: p.label };
    return { id: "web", label: host };
  }
  return { id: "web", label: "Web" };
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character video id of a YouTube watch / short / embed / youtu.be link. */
export function youtubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = parsed.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") id = parsed.searchParams.get("v");
    else {
      const m = /^\/(shorts|embed|live)\/([^/?#]+)/.exec(parsed.pathname);
      id = m?.[2] ?? null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export type FeaturedMediaType =
  | "post"
  | "video"
  | "article"
  | "podcast"
  | "talk"
  | "other";

/** A sensible type when the person did not choose one. */
export function guessMediaType(url: string): FeaturedMediaType {
  const { id } = detectPlatform(url);
  if (id === "youtube" || id === "vimeo" || id === "tiktok") return "video";
  if (id === "spotify" || id === "apple_podcasts") return "podcast";
  if (id === "medium" || id === "substack") return "article";
  if (id === "web") return "article";
  return "post";
}
