"use client";

import { useEffect, useRef } from "react";

/**
 * Records a page view and the visitor's clicks on outbound links for the owner's Insights.
 * No cookies, no storage, no fingerprinting: the server keeps only coarse labels (see
 * src/domains/insights/event-input.ts). Elements can describe themselves with
 *   data-track-event="qr_open"            (a non-link action)
 *   data-track-kind="featured"            (what kind of link this is)
 *   data-track-label="My talk at …"       (a readable name)
 * Otherwise the kind is taken from the surrounding section (#social, #projects, …).
 */
type Surface = "website" | "card";

const ENDPOINT = "/api/pulse";
const TRACK_EVENT = "folioone:track";

/**
 * For actions that are not clicks (a video played to the end): the page's PageTracker sends
 * it. Without a tracker on the page (the owner's preview) nothing is recorded.
 */
export function trackInsight(detail: {
  event: string;
  kind?: string;
  label?: string;
}) {
  try {
    window.dispatchEvent(new CustomEvent(TRACK_EVENT, { detail }));
  } catch {
    /* tracking must never break the page */
  }
}

function send(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    if (
      navigator.sendBeacon?.(
        ENDPOINT,
        new Blob([body], { type: "application/json" }),
      )
    )
      return;
    void fetch(ENDPOINT, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    /* tracking must never break the page */
  }
}

const SECTION_KIND: Record<string, string> = {
  social: "social",
  featured: "featured",
  projects: "project",
  certifications: "certification",
  contact: "contact",
  articles: "article",
};

function linkKind(el: Element): string {
  const own = el.closest("[data-track-kind]")?.getAttribute("data-track-kind");
  if (own) return own;
  const section = el.closest("section[id]")?.id;
  return (section && SECTION_KIND[section]) || "link";
}

function linkLabel(el: Element, fallback: string): string {
  const own = el
    .closest("[data-track-label]")
    ?.getAttribute("data-track-label");
  const text = (own || el.getAttribute("aria-label") || el.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, 160);
}

export function PageTracker({ surface, id }: { surface: Surface; id: string }) {
  const sent = useRef(false);

  useEffect(() => {
    const base = () => ({
      surface,
      id,
      path: window.location.pathname,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    if (!sent.current) {
      sent.current = true;
      const q = new URLSearchParams(window.location.search);
      send({
        ...base(),
        event: "view",
        referrer: document.referrer || undefined,
        utmSource: q.get("utm_source") || q.get("ref") || undefined,
        utmMedium: q.get("utm_medium") || undefined,
        utmCampaign: q.get("utm_campaign") || undefined,
      });
    }

    function onClick(e: MouseEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const action = target.closest("[data-track-event]");
      if (action) {
        send({
          ...base(),
          event: action.getAttribute("data-track-event"),
          kind: action.getAttribute("data-track-kind") || undefined,
          label: linkLabel(action, "Action"),
        });
        return;
      }

      const a = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("mailto:") || href.startsWith("tel:")) {
        const email = href.startsWith("mailto:");
        send({
          ...base(),
          event: "contact_click",
          kind: email ? "email" : "phone",
          label: email ? "Email" : "Phone",
        });
        return;
      }
      let url: URL;
      try {
        url = new URL(a.href);
      } catch {
        return;
      }
      if (!/^https?:$/.test(url.protocol)) return;
      // Own-site links (articles, the website from the links page) count only when marked.
      if (
        url.host === window.location.host &&
        !a.hasAttribute("data-track-kind")
      )
        return;
      send({
        ...base(),
        event: "link_click",
        kind: linkKind(a),
        label: linkLabel(a, url.hostname),
        url: url.toString(),
      });
    }

    function onTrack(e: Event) {
      const d = (e as CustomEvent).detail as
        | { event?: unknown; kind?: unknown; label?: unknown }
        | undefined;
      if (!d || typeof d.event !== "string") return;
      send({
        ...base(),
        event: d.event,
        kind: typeof d.kind === "string" ? d.kind : undefined,
        label: typeof d.label === "string" ? d.label.slice(0, 160) : undefined,
      });
    }

    // Capture phase + auxclick: middle-clicks and new-tab opens count too.
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    window.addEventListener(TRACK_EVENT, onTrack);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
      window.removeEventListener(TRACK_EVENT, onTrack);
    };
  }, [surface, id]);

  return null;
}
