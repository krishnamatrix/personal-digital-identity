"use client";

import { useCallback, useState } from "react";

type Announcement = { polite: string; assertive: string };

/**
 * Screen-reader announcements. Render <LiveRegions> once per screen and call
 * `announce` after save, conflict, archive and default changes. Repeating the
 * same text still re-announces because a trailing zero-width space alternates.
 */
export function useAnnouncer() {
  const [state, setState] = useState<Announcement>({
    polite: "",
    assertive: "",
  });
  const announce = useCallback(
    (message: string, priority: "polite" | "assertive" = "polite") => {
      setState((current) => {
        const flip = current[priority].endsWith("​") ? "" : "​";
        return { ...current, [priority]: message + flip };
      });
    },
    [],
  );
  return { announcements: state, announce };
}

export function LiveRegions({
  announcements,
}: {
  announcements: Announcement;
}) {
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcements.polite}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {announcements.assertive}
      </div>
    </>
  );
}
