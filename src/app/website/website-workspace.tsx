"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { ExternalLink, Laptop, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddressEditor } from "@/app/website/address-editor";
import { ContentEditor } from "@/app/website/content-editor";
import { SharePanel } from "@/app/website/share-panel";
import {
  publishAction,
  saveDraftAction,
  unpublishAction,
} from "@/app/website/actions";
import {
  THEMES,
  type SectionId,
  type ThemeId,
  type WebsiteConfig,
  type WebsiteStatus,
} from "@/domains/website/config";
import type { PublishProblem } from "@/domains/website/build-published";

export type ArticleChoice = {
  id: string;
  title: string;
  subtitle: string;
};

export type EntryChoice = {
  id: string;
  title: string;
  subtitle: string;
  masterVisible: boolean;
};

type Initial = {
  status: WebsiteStatus;
  slug: string | null;
  theme: ThemeId;
  config: WebsiteConfig;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  problems: PublishProblem[];
};

type Tab =
  | "overview"
  | "address"
  | "content"
  | "design"
  | "preview"
  | "publish";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "address", label: "Address" },
  { id: "content", label: "Content" },
  { id: "design", label: "Design" },
  { id: "preview", label: "Preview" },
  { id: "publish", label: "Publish" },
];

const STATUS_LABEL: Record<WebsiteStatus, string> = {
  not_created: "Not created",
  draft: "Draft",
  published: "Published",
  unpublished: "Unpublished",
};
const STATUS_TONE: Record<WebsiteStatus, string> = {
  not_created: "bg-muted text-muted-foreground",
  draft: "bg-amber-100 text-amber-900",
  published: "bg-green-100 text-green-900",
  unpublished: "bg-red-100 text-red-900",
};

const DEVICES = {
  desktop: { label: "Desktop", width: "100%", icon: Laptop },
  tablet: { label: "Tablet", width: "768px", icon: Tablet },
  mobile: { label: "Mobile", width: "390px", icon: Smartphone },
} as const;

export function WebsiteWorkspace({
  origin,
  initial,
  choices,
  articleChoices,
  hasContent,
  has,
  suggestedSlug,
}: {
  origin: string;
  initial: Initial;
  choices: Partial<Record<SectionId, EntryChoice[]>>;
  articleChoices: ArticleChoice[];
  hasContent: Record<SectionId, boolean>;
  has: { email: boolean; phone: boolean; website: boolean; name: boolean };
  suggestedSlug: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [slug, setSlug] = useState(initial.slug);
  const [status, setStatus] = useState(initial.status);
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [changes, setChanges] = useState(initial.hasUnpublishedChanges);
  const [theme, setTheme] = useState(initial.theme);
  const [config, setConfig] = useState(initial.config);
  const [saved, setSaved] = useState(
    JSON.stringify({ theme: initial.theme, config: initial.config }),
  );
  const [previewKey, setPreviewKey] = useState(0);
  const [device, setDevice] = useState<keyof typeof DEVICES>("desktop");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify({ theme, config }) !== saved;
  const publicUrl = slug ? `${origin}/${slug}` : null;
  const created = status !== "not_created";
  const live = status === "published";

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const say = (ok: boolean, text: string) => setNotice({ ok, text });

  const saveDraft = useCallback(async () => {
    const r = await saveDraftAction(theme, config);
    if (r.ok) {
      setSaved(JSON.stringify({ theme, config }));
      setPreviewKey((k) => k + 1);
      if (live) setChanges(true);
    }
    return r;
  }, [theme, config, live]);

  function onSaveDraft() {
    startTransition(async () => {
      const r = await saveDraft();
      say(r.ok, r.message);
    });
  }

  function onPublish() {
    startTransition(async () => {
      if (dirty) {
        const d = await saveDraft();
        if (!d.ok) return say(false, d.message);
      }
      const r = await publishAction();
      if (r.ok) {
        setStatus("published");
        setPublishedAt(r.publishedAt ?? new Date().toISOString());
        setChanges(false);
      }
      say(r.ok, r.message);
    });
  }

  function onUnpublish() {
    setConfirmUnpublish(false);
    startTransition(async () => {
      const r = await unpublishAction();
      if (r.ok) {
        setStatus("unpublished");
        setChanges(false);
      }
      say(r.ok, r.message);
    });
  }

  const lastPublished = useMemo(
    () =>
      publishedAt
        ? new Date(publishedAt).toLocaleString("en", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "Never",
    [publishedAt],
  );

  const needsAddress = (
    <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
      <p className="text-foreground font-medium">Choose your address first</p>
      <p className="mt-1">
        Your website needs an address before you can set it up.
      </p>
      <Button className="mt-4" onClick={() => setTab("address")}>
        Choose address
      </Button>
    </div>
  );

  const publishBar = (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={pending || !dirty}
        onClick={onSaveDraft}
      >
        {pending ? "Saving…" : "Save draft"}
      </Button>
      {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-accent text-xs font-semibold tracking-[.14em] uppercase">
            My presence
          </p>
          <h1 className="mt-2 font-serif text-3xl">My Website</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Turn your Master Identity into a personal website. You choose what
            is shown, and nothing goes public until you publish.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[status]}`}
          data-testid="website-status"
        >
          {STATUS_LABEL[status]}
        </span>
      </header>

      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`rounded-md border px-4 py-3 text-sm ${notice.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          {notice.text}
        </p>
      )}

      <nav
        aria-label="Website sections"
        className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0"
      >
        <ul className="border-border flex gap-1 border-b">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm whitespace-nowrap ${tab === t.id ? "border-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent"}`}
              >
                {t.label}
                {t.id !== "overview" &&
                  t.id !== "address" &&
                  t.id !== "preview" &&
                  dirty && (
                    <span
                      className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500"
                      aria-label="Unsaved changes"
                    />
                  )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-border bg-card rounded-lg border p-5 md:p-8">
        {tab === "overview" && (
          <div className="space-y-6">
            {!created ? (
              <div className="space-y-3">
                <h2 className="font-serif text-2xl">Create your website</h2>
                <p className="text-muted-foreground max-w-xl text-sm leading-6">
                  Pick an address like{" "}
                  <span className="font-mono">
                    {origin.replace(/^https?:\/\//, "")}/
                    {suggestedSlug || "your-name"}
                  </span>
                  , choose what to show, pick a design and publish. It takes a
                  couple of minutes.
                </p>
                <Button onClick={() => setTab("address")}>
                  Choose your address
                </Button>
              </div>
            ) : (
              <>
                <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Public address</dt>
                    <dd className="mt-1 font-mono break-all">{publicUrl}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Theme</dt>
                    <dd className="mt-1">
                      {THEMES.find((t) => t.id === theme)?.label}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="mt-1">
                      {live
                        ? "Live: visitors can open it"
                        : status === "unpublished"
                          ? "Unpublished: visitors see a not-found page"
                          : "Draft: not public yet"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last published</dt>
                    <dd className="mt-1">{lastPublished}</dd>
                  </div>
                </dl>
                {live && changes && (
                  <p
                    className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                    data-testid="unpublished-changes"
                  >
                    My Identity or your website settings changed since you last
                    published. The public site still shows the previous version.
                  </p>
                )}
                {initial.problems.length > 0 && !live && (
                  <p className="text-sm text-amber-800">
                    Before publishing:{" "}
                    {initial.problems.includes("no_name")
                      ? "add your name in "
                      : "add some content in "}
                    <Link href="/profile" className="underline">
                      My Identity
                    </Link>
                    .
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => setTab("preview")}>
                    Preview
                  </Button>
                  <Button disabled={pending} onClick={onPublish}>
                    {pending
                      ? "Working…"
                      : live
                        ? changes || dirty
                          ? "Republish"
                          : "Publish again"
                        : status === "unpublished"
                          ? "Publish again"
                          : "Publish"}
                  </Button>
                  {live && (
                    <Button
                      variant="destructive-outline"
                      disabled={pending}
                      onClick={() => setConfirmUnpublish(true)}
                    >
                      Unpublish
                    </Button>
                  )}
                </div>
                {live && publicUrl && <SharePanel url={publicUrl} />}
              </>
            )}
          </div>
        )}

        {tab === "address" && (
          <AddressEditor
            origin={origin}
            slug={slug}
            published={live}
            suggestion={suggestedSlug}
            onSaved={(s) => {
              setSlug(s);
              if (status === "not_created") setStatus("draft");
              say(true, `Address saved: /${s}`);
            }}
          />
        )}

        {tab === "content" &&
          (created ? (
            <div className="space-y-6">
              <ContentEditor
                config={config}
                onChange={setConfig}
                choices={choices}
                articleChoices={articleChoices}
                hasContent={hasContent}
                has={has}
              />
              {publishBar}
            </div>
          ) : (
            needsAddress
          ))}

        {tab === "design" &&
          (created ? (
            <div className="space-y-6">
              <p className="text-muted-foreground text-sm leading-6">
                Every theme shows the same content. Switching never changes your
                Master Identity.
              </p>
              <ul
                className="grid gap-4 md:grid-cols-3"
                role="radiogroup"
                aria-label="Theme"
              >
                {THEMES.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={theme === t.id}
                      onClick={() => setTheme(t.id)}
                      className={`h-full w-full rounded-lg border p-4 text-left transition ${theme === t.id ? "border-accent ring-accent ring-2" : "border-border hover:border-foreground/30"}`}
                    >
                      <ThemeSwatch id={t.id} />
                      <p className="mt-3 font-medium">{t.label}</p>
                      <p className="text-muted-foreground mt-1 text-xs leading-5">
                        {t.blurb}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
              {publishBar}
            </div>
          ) : (
            needsAddress
          ))}

        {tab === "preview" &&
          (created ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="group"
                  aria-label="Preview size"
                  className="flex gap-1"
                >
                  {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map(
                    (d) => {
                      const Icon = DEVICES[d].icon;
                      return (
                        <Button
                          key={d}
                          type="button"
                          size="sm"
                          variant={device === d ? "default" : "outline"}
                          aria-pressed={device === d}
                          onClick={() => setDevice(d)}
                        >
                          <Icon className="size-4" /> {DEVICES[d].label}
                        </Button>
                      );
                    },
                  )}
                </div>
                <a
                  href="/website/preview"
                  target="_blank"
                  rel="noopener"
                  className="text-accent inline-flex items-center gap-1 text-sm underline underline-offset-4"
                >
                  <ExternalLink className="size-4" /> Open full preview
                </a>
              </div>
              {dirty && (
                <p className="text-xs text-amber-700">
                  The preview shows your last saved draft.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={onSaveDraft}
                  >
                    Save draft
                  </button>{" "}
                  to see your latest changes.
                </p>
              )}
              <div className="bg-muted flex justify-center overflow-hidden rounded-lg p-2 md:p-4">
                <iframe
                  key={previewKey}
                  title="Website preview"
                  src="/website/preview"
                  style={{
                    width: DEVICES[device].width,
                    maxWidth: "100%",
                    height: "72vh",
                  }}
                  className="border-border rounded-md border bg-white transition-[width] duration-300"
                />
              </div>
              {publishBar}
            </div>
          ) : (
            needsAddress
          ))}

        {tab === "publish" &&
          (created ? (
            <div className="space-y-8">
              <section className="space-y-3">
                <h2 className="font-serif text-xl">Search and sharing</h2>
                <p className="text-muted-foreground text-sm">
                  Leave blank to use your name, headline and short biography.
                </p>
                <div className="grid max-w-xl gap-3">
                  <label className="text-sm font-medium" htmlFor="seo-title">
                    Page title
                  </label>
                  <Input
                    id="seo-title"
                    value={config.seo.title ?? ""}
                    maxLength={120}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        seo: { ...config.seo, title: e.target.value },
                      })
                    }
                  />
                  <label className="text-sm font-medium" htmlFor="seo-desc">
                    Description
                  </label>
                  <Textarea
                    id="seo-desc"
                    value={config.seo.description ?? ""}
                    maxLength={300}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        seo: { ...config.seo, description: e.target.value },
                      })
                    }
                  />
                </div>
                {publishBar}
              </section>
              <section className="space-y-3">
                <h2 className="font-serif text-xl">Publishing</h2>
                <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                  <li>
                    Publishing saves your draft and creates a snapshot of the
                    selected content.
                  </li>
                  <li>
                    Later edits to My Identity do not change the public site
                    until you publish again.
                  </li>
                  <li>Unpublishing removes the public page immediately.</li>
                </ul>
                <div className="flex flex-wrap gap-3">
                  <Button disabled={pending} onClick={onPublish}>
                    {pending ? "Working…" : live ? "Republish" : "Publish"}
                  </Button>
                  {live && (
                    <Button
                      variant="destructive-outline"
                      disabled={pending}
                      onClick={() => setConfirmUnpublish(true)}
                    >
                      Unpublish
                    </Button>
                  )}
                </div>
              </section>
              {live && publicUrl && <SharePanel url={publicUrl} />}
            </div>
          ) : (
            needsAddress
          ))}
      </div>

      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title="Unpublish your website?"
        description={
          <>
            The page at <strong>/{slug}</strong> will immediately show a
            not-found page. You can publish again at any time.
          </>
        }
        confirmLabel="Unpublish"
        tone="danger"
        pending={pending}
        onConfirm={onUnpublish}
      />
    </div>
  );
}

function ThemeSwatch({ id }: { id: ThemeId }) {
  if (id === "creative")
    return (
      <div className="h-24 rounded-md bg-[#12101a] p-3" aria-hidden="true">
        <div className="h-3 w-2/3 rounded bg-gradient-to-r from-[#ff7a59] to-[#b66dff]" />
        <div className="mt-2 h-2 w-1/2 rounded bg-white/30" />
        <div className="mt-3 flex gap-2">
          <div className="h-8 w-1/2 rounded bg-white/10" />
          <div className="h-8 w-1/2 rounded bg-white/10" />
        </div>
      </div>
    );
  if (id === "minimal")
    return (
      <div className="h-24 rounded-md border bg-white p-4" aria-hidden="true">
        <div className="h-2.5 w-1/3 rounded bg-neutral-900" />
        <div className="mt-2 h-1.5 w-1/2 rounded bg-neutral-300" />
        <div className="mt-4 h-1.5 w-full rounded bg-neutral-200" />
        <div className="mt-1.5 h-1.5 w-5/6 rounded bg-neutral-200" />
      </div>
    );
  return (
    <div
      className="h-24 rounded-md bg-[#faf8f4] p-3 ring-1 ring-[#e2ddd1]"
      aria-hidden="true"
    >
      <div className="h-3 w-1/2 rounded bg-[#1f2328]" />
      <div className="mt-2 h-2 w-2/3 rounded bg-[#2f4a5a]/50" />
      <div className="mt-3 ml-1 space-y-1.5 border-l-2 border-[#d9d4c8] pl-3">
        <div className="h-1.5 w-3/4 rounded bg-[#d9d4c8]" />
        <div className="h-1.5 w-2/3 rounded bg-[#d9d4c8]" />
      </div>
    </div>
  );
}
