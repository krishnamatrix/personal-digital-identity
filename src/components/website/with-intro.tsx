import type { ReactNode } from "react";
import type { PublishedContent } from "@/domains/website/published-content";
import { IntroPill, IntroTrigger } from "@/components/website/intro-video";
import { IntroVideoPlayer } from "@/components/website/intro-video-player";
import { formatDuration, playLength } from "@/domains/intro/intro-video";

/**
 * The hero portrait's frame. With a published video intro it becomes the "Watch intro"
 * button; without one it is a plain wrapper of the same size, so layouts never shift.
 * `className` carries the portrait's size, shape and visibility.
 *
 * A cut-out intro on a large portrait plays in place instead: the photo gives way to the
 * person drawn straight onto the page, who talks right there when tapped. Small avatars
 * ("dot") open the dialog, where the cut-out plays over the dimmed page.
 */
export function WithIntro({
  content,
  className,
  badge = "pill",
  children,
}: {
  content: PublishedContent;
  className: string;
  badge?: "pill" | "dot";
  children: ReactNode;
}) {
  const intro = content.person.intro;
  if (!intro)
    return (
      <span className={`relative block shrink-0 ${className}`}>{children}</span>
    );
  if (intro.background === "cutout" && badge === "pill")
    return (
      <IntroVideoPlayer
        intro={intro}
        name={content.person.name}
        layout="inline"
        // A tilted frame suits a photo, not a person standing on the page.
        className={`shrink-0 ${className.replace(/(^|\s)-?rotate-\S+/g, "")}`}
        idle={<IntroPill length={formatDuration(playLength(intro))} />}
      >
        {children}
      </IntroVideoPlayer>
    );
  return (
    <IntroTrigger
      intro={intro}
      name={content.person.name}
      badge={badge}
      className={className}
    >
      {children}
    </IntroTrigger>
  );
}
