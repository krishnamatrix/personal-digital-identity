import type { ReactNode } from "react";
import type { PublishedContent } from "@/domains/website/published-content";
import { IntroTrigger } from "@/components/website/intro-video";

/**
 * The hero portrait's frame. With a published video intro it becomes the "Watch intro"
 * button; without one it is a plain wrapper of the same size, so layouts never shift.
 * `className` carries the portrait's size, shape and visibility.
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
