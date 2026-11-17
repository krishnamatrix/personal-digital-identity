"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import {
  ArrowLeft,
  Bold,
  Code,
  Code2,
  Eye,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  PenLine,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LiveRegions, useAnnouncer } from "@/components/ui/live-region";
import { ArticleView } from "@/components/articles/article-view";
import {
  deleteArticleAction,
  saveArticleAction,
  transitionArticleAction,
  type ArticleActionResult,
} from "@/app/articles/actions";
import {
  ARTICLE_LIMITS,
  deriveBodyFacts,
  type ArticleStatus,
} from "@/domains/articles/article-schema";
import { sanitizeDoc, type RichDoc } from "@/domains/articles/rich-text";

export type EditorArticle = {
  id: string;
  version: number;
  status: ArticleStatus;
  slug: string | null;
  title: string;
  subtitle: string;
  excerpt: string;
  coverImageUrl: string;
  category: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  content: RichDoc;
  publishedAt: string | null;
  updatedAt: string;
};

type SaveState = "saved" | "dirty" | "saving" | "failed" | "conflict";
const AUTOSAVE_MS = 1500;

const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`hover:bg-muted rounded-md p-2 transition-colors disabled:opacity-30 ${active ? "bg-accent-soft text-accent" : ""}`}
    >
      {children}
    </button>
  );
}

export function ArticleEditor({ initial }: { initial: EditorArticle }) {
  const router = useRouter();
  const { announcements, announce } = useAnnouncer();

  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [coverImageUrl, setCoverImageUrl] = useState(initial.coverImageUrl);
  const [category, setCategory] = useState(initial.category);
  const [tagText, setTagText] = useState(initial.tags.join(", "));
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle);
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription);
  const [doc, setDoc] = useState<RichDoc>(initial.content);

  const [version, setVersion] = useState(initial.version);
  const [status, setStatus] = useState(initial.status);
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [urlPrompt, setUrlPrompt] = useState<null | "link" | "image">(null);
  const [urlValue, setUrlValue] = useState("");
  const [confirm, setConfirm] = useState<null | "delete" | "archive">(null);
  const [busy, setBusy] = useState(false);

  const versionRef = useRef(version);
  versionRef.current = version;
  const saving = useRef(false);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const tags = useMemo(
    () =>
      tagText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, ARTICLE_LIMITS.tags),
    [tagText],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        underline: false,
        strike: false,
        link: { openOnClick: false, autolink: false },
      }),
      Image,
    ],
    content: initial.content,
    editable: initial.status !== "archived",
    editorProps: {
      attributes: {
        "aria-label": "Article body",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: e }) => {
      setDoc(sanitizeDoc(e.getJSON()));
      markDirty();
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            code: e.isActive("code"),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
            link: e.isActive("link"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  const facts = useMemo(() => deriveBodyFacts(doc), [doc]);

  const payload = useCallback(
    () => ({
      title,
      subtitle,
      excerpt,
      coverImageUrl,
      category,
      tags,
      seoTitle,
      seoDescription,
      content: doc,
    }),
    [
      title,
      subtitle,
      excerpt,
      coverImageUrl,
      category,
      tags,
      seoTitle,
      seoDescription,
      doc,
    ],
  );
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  function apply(result: Extract<ArticleActionResult, { ok: true }>) {
    setVersion(result.version);
    versionRef.current = result.version;
    setStatus(result.status);
    setPublishedAt(result.publishedAt);
    setSavedAt(result.updatedAt);
  }

  const save = useCallback(async (): Promise<boolean> => {
    if (saving.current) {
      queued.current = true;
      return false;
    }
    if (timer.current) clearTimeout(timer.current);
    saving.current = true;
    dirty.current = false;
    setSaveState("saving");
    const result = await saveArticleAction(
      initial.id,
      versionRef.current,
      payloadRef.current(),
    );
    saving.current = false;
    if (result.ok) {
      apply(result);
      setMessage(null);
      if (dirty.current || queued.current) {
        queued.current = false;
        setSaveState("dirty");
        void save();
      } else {
        setSaveState("saved");
        announce("Article saved.");
      }
      return true;
    }
    dirty.current = true;
    if (result.code === "conflict") {
      setSaveState("conflict");
      announce(result.message, "assertive");
    } else {
      setSaveState("failed");
      announce(`Save failed. ${result.message}`, "assertive");
    }
    setMessage(result.message);
    return false;
  }, [initial.id, announce]);

  function markDirty() {
    dirty.current = true;
    setSaveState((s) => (s === "conflict" ? s : "dirty"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  }
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      markDirty();
    };

  useEffect(
    () => () => void (timer.current && clearTimeout(timer.current)),
    [],
  );

  // Warn before leaving with unsaved work (browser tab close / reload / navigation).
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "saved") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  async function transition(target: ArticleStatus) {
    setBusy(true);
    setMessage(null);
    // Never publish or archive stale text: persist pending edits first.
    if (saveState !== "saved" && !(await saveNow())) {
      setBusy(false);
      return;
    }
    const result = await transitionArticleAction(
      initial.id,
      versionRef.current,
      target,
    );
    setBusy(false);
    if (result.ok) {
      apply(result);
      editor?.setEditable(result.status !== "archived");
      const text =
        target === "published"
          ? "Published to Folioone. It appears on your website only once you select it there and publish the site."
          : target === "archived"
            ? "Article archived."
            : status === "archived"
              ? "Article restored to drafts."
              : "Article unpublished and moved to drafts.";
      setMessage(text);
      announce(text);
      router.refresh();
    } else {
      setMessage(result.message);
      if (result.code === "conflict") setSaveState("conflict");
      announce(result.message, "assertive");
    }
  }

  async function saveNow() {
    while (saving.current) await new Promise((r) => setTimeout(r, 50));
    return save();
  }

  async function remove() {
    setBusy(true);
    const result = await deleteArticleAction(initial.id, versionRef.current);
    setBusy(false);
    if (result.ok) {
      dirty.current = false;
      setSaveState("saved");
      router.push("/articles");
      router.refresh();
    } else {
      setConfirm(null);
      setMessage(result.message);
    }
  }

  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!editor || !urlPrompt) return;
    const value = urlValue.trim();
    if (value && !/^https?:\/\/[^\s]+$/.test(value)) {
      setMessage("Enter a full web address starting with http:// or https://");
      return;
    }
    if (urlPrompt === "link") {
      if (value === "") editor.chain().focus().unsetLink().run();
      else
        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href: value })
          .run();
    } else if (value) {
      editor.chain().focus().setImage({ src: value }).run();
    }
    setMessage(null);
    setUrlPrompt(null);
    setUrlValue("");
  }

  function openPrompt(kind: "link" | "image") {
    if (!editor) return;
    setUrlValue(
      kind === "link"
        ? ((editor.getAttributes("link").href as string) ?? "")
        : "",
    );
    setUrlPrompt(kind);
  }

  const locked = status === "archived";
  const stateText: Record<SaveState, string> = {
    saved: savedAt
      ? `Saved ${new Date(savedAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}`
      : "Saved",
    dirty: "Unsaved changes",
    saving: "Saving…",
    failed: "Save failed",
    conflict: "Changed elsewhere",
  };

  const leave = (e: React.MouseEvent) => {
    if (
      saveState !== "saved" &&
      !window.confirm("You have unsaved changes. Leave without saving?")
    )
      e.preventDefault();
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <LiveRegions announcements={announcements} />
      <div className="border-border bg-background/90 sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-b px-1 py-3 backdrop-blur">
        <Link
          href="/articles"
          onClick={leave}
          className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> Articles
        </Link>
        <span
          data-testid="article-status"
          className="bg-accent-soft text-accent rounded-full px-2.5 py-1 text-xs font-medium"
        >
          {STATUS_LABEL[status]}
        </span>
        <span
          data-testid="save-state"
          aria-live="off"
          className={`text-xs ${saveState === "failed" || saveState === "conflict" ? "text-danger font-medium" : "text-muted-foreground"}`}
        >
          {stateText[saveState]}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Editor mode"
            className="border-border flex rounded-md border p-0.5"
          >
            <button
              type="button"
              aria-pressed={mode === "write"}
              onClick={() => setMode("write")}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${mode === "write" ? "bg-muted font-medium" : ""}`}
            >
              <PenLine className="size-3.5" aria-hidden /> Write
            </button>
            <button
              type="button"
              aria-pressed={mode === "preview"}
              onClick={() => setMode("preview")}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${mode === "preview" ? "bg-muted font-medium" : ""}`}
            >
              <Eye className="size-3.5" aria-hidden /> Preview
            </button>
          </div>
          {!locked && (
            <Button
              pending={busy}
              size="sm"
              variant="outline"
              disabled={busy || saveState === "saving" || saveState === "saved"}
              onClick={() => void saveNow()}
            >
              Save
            </Button>
          )}
          {status === "draft" && (
            <Button
              pending={busy}
              size="sm"
              variant="accent"
              disabled={busy}
              onClick={() => void transition("published")}
            >
              Publish
            </Button>
          )}
          {status === "published" && (
            <Button
              pending={busy}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void transition("draft")}
            >
              Unpublish
            </Button>
          )}
          {status === "archived" ? (
            <Button
              pending={busy}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void transition("draft")}
            >
              Restore to draft
            </Button>
          ) : (
            <Button
              pending={busy}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm("archive")}
            >
              Archive
            </Button>
          )}
          <Button
            pending={busy}
            size="sm"
            variant="destructive-outline"
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            Delete
          </Button>
        </div>
      </div>

      {message && (
        <p
          role={
            saveState === "failed" || saveState === "conflict"
              ? "alert"
              : "status"
          }
          className={`mt-4 rounded-md border px-3 py-2 text-sm ${saveState === "failed" || saveState === "conflict" ? "border-danger/40 bg-danger-soft text-danger" : "border-border bg-card"}`}
        >
          {message}{" "}
          {saveState === "conflict" && (
            <button
              type="button"
              className="underline"
              onClick={() => {
                dirty.current = false;
                window.location.reload();
              }}
            >
              Reload latest version
            </button>
          )}
        </p>
      )}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {mode === "preview" ? (
            <div
              data-testid="article-preview"
              className="border-border rounded-lg border bg-[#faf8f4] text-[#2a2e33]"
            >
              <ArticleView
                article={{
                  title,
                  subtitle: subtitle || null,
                  coverImageUrl: coverImageUrl || null,
                  category: category || null,
                  tags,
                  readingMinutes: facts.readingMinutes,
                  wordCount: facts.wordCount,
                  publishedAt: publishedAt ? new Date(publishedAt) : null,
                  content: doc,
                }}
              />
            </div>
          ) : (
            <div className="article-editor mx-auto max-w-[42rem]">
              <label htmlFor="article-title" className="sr-only">
                Title
              </label>
              <textarea
                id="article-title"
                rows={1}
                value={title}
                disabled={locked}
                maxLength={ARTICLE_LIMITS.title}
                placeholder="Title"
                onChange={(e) =>
                  edit(setTitle)(e.target.value.replace(/\n/g, " "))
                }
                className="placeholder:text-muted-foreground/60 article-title field-sizing-content w-full resize-none bg-transparent outline-none"
              />
              <label htmlFor="article-subtitle" className="sr-only">
                Subtitle
              </label>
              <textarea
                id="article-subtitle"
                rows={1}
                value={subtitle}
                disabled={locked}
                maxLength={ARTICLE_LIMITS.subtitle}
                placeholder="Subtitle (optional)"
                onChange={(e) =>
                  edit(setSubtitle)(e.target.value.replace(/\n/g, " "))
                }
                className="text-muted-foreground placeholder:text-muted-foreground/50 mt-3 field-sizing-content w-full resize-none bg-transparent text-xl leading-8 outline-none"
              />

              {!locked && (
                <div
                  role="toolbar"
                  aria-label="Formatting"
                  className="border-border bg-card/95 sticky top-16 z-[5] mt-6 flex flex-wrap items-center gap-0.5 rounded-lg border p-1 shadow-sm"
                >
                  <ToolButton
                    label="Heading"
                    active={state?.h2}
                    onClick={() =>
                      editor?.chain().focus().toggleHeading({ level: 2 }).run()
                    }
                  >
                    <Heading2 className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Subheading"
                    active={state?.h3}
                    onClick={() =>
                      editor?.chain().focus().toggleHeading({ level: 3 }).run()
                    }
                  >
                    <Heading3 className="size-4" />
                  </ToolButton>
                  <span className="bg-border mx-1 h-5 w-px" aria-hidden />
                  <ToolButton
                    label="Bold"
                    active={state?.bold}
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                  >
                    <Bold className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Italic"
                    active={state?.italic}
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                  >
                    <Italic className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Inline code"
                    active={state?.code}
                    onClick={() => editor?.chain().focus().toggleCode().run()}
                  >
                    <Code className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Link"
                    active={state?.link}
                    onClick={() => openPrompt("link")}
                  >
                    <Link2 className="size-4" />
                  </ToolButton>
                  <span className="bg-border mx-1 h-5 w-px" aria-hidden />
                  <ToolButton
                    label="Bulleted list"
                    active={state?.bullet}
                    onClick={() =>
                      editor?.chain().focus().toggleBulletList().run()
                    }
                  >
                    <List className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Numbered list"
                    active={state?.ordered}
                    onClick={() =>
                      editor?.chain().focus().toggleOrderedList().run()
                    }
                  >
                    <ListOrdered className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Quote"
                    active={state?.quote}
                    onClick={() =>
                      editor?.chain().focus().toggleBlockquote().run()
                    }
                  >
                    <Quote className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Code block"
                    active={state?.codeBlock}
                    onClick={() =>
                      editor?.chain().focus().toggleCodeBlock().run()
                    }
                  >
                    <Code2 className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Image from URL"
                    onClick={() => openPrompt("image")}
                  >
                    <ImageIcon className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Divider"
                    onClick={() =>
                      editor?.chain().focus().setHorizontalRule().run()
                    }
                  >
                    <Minus className="size-4" />
                  </ToolButton>
                  <span className="bg-border mx-1 h-5 w-px" aria-hidden />
                  <ToolButton
                    label="Undo"
                    disabled={!state?.canUndo}
                    onClick={() => editor?.chain().focus().undo().run()}
                  >
                    <Undo2 className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Redo"
                    disabled={!state?.canRedo}
                    onClick={() => editor?.chain().focus().redo().run()}
                  >
                    <Redo2 className="size-4" />
                  </ToolButton>
                </div>
              )}

              {urlPrompt && (
                <form
                  onSubmit={submitUrl}
                  className="border-border bg-card mt-2 flex flex-wrap items-center gap-2 rounded-lg border p-2"
                >
                  <label htmlFor="url-prompt" className="text-xs font-medium">
                    {urlPrompt === "link" ? "Link address" : "Image address"}
                  </label>
                  <Input
                    id="url-prompt"
                    autoFocus
                    value={urlValue}
                    placeholder="https://"
                    onChange={(e) => setUrlValue(e.target.value)}
                    className="h-8 min-w-48 flex-1"
                  />
                  <Button type="submit" size="sm">
                    {urlPrompt === "link" ? "Apply link" : "Insert image"}
                  </Button>
                  {urlPrompt === "link" && state?.link && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        editor
                          ?.chain()
                          .focus()
                          .extendMarkRange("link")
                          .unsetLink()
                          .run();
                        setUrlPrompt(null);
                      }}
                    >
                      Remove link
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setUrlPrompt(null)}
                  >
                    Cancel
                  </Button>
                </form>
              )}

              <div className="mt-6">
                <EditorContent editor={editor} data-testid="article-editor" />
              </div>
            </div>
          )}
        </div>

        <aside
          aria-label="Article details"
          className="space-y-5 text-sm lg:sticky lg:top-24 lg:self-start"
        >
          <dl className="border-border grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
            <div>
              <dt className="text-muted-foreground text-xs">Words</dt>
              <dd data-testid="word-count" className="font-medium">
                {facts.wordCount.toLocaleString("en")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Reading time</dt>
              <dd data-testid="reading-time" className="font-medium">
                {facts.readingMinutes > 0 ? `${facts.readingMinutes} min` : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Status</dt>
              <dd className="font-medium">{STATUS_LABEL[status]}</dd>
            </div>
          </dl>

          <fieldset disabled={locked} className="space-y-4">
            <legend className="sr-only">Details</legend>
            <Field
              id="a-excerpt"
              label="Excerpt"
              hint="Shown on cards and lists. Leave empty to use the start of the article."
            >
              <Textarea
                id="a-excerpt"
                rows={3}
                maxLength={ARTICLE_LIMITS.excerpt}
                value={excerpt}
                onChange={(e) => edit(setExcerpt)(e.target.value)}
              />
            </Field>
            <Field id="a-cover" label="Cover image URL">
              <Input
                id="a-cover"
                inputMode="url"
                placeholder="https://"
                value={coverImageUrl}
                onChange={(e) => edit(setCoverImageUrl)(e.target.value)}
              />
            </Field>
            <Field id="a-category" label="Category">
              <Input
                id="a-category"
                maxLength={ARTICLE_LIMITS.category}
                value={category}
                onChange={(e) => edit(setCategory)(e.target.value)}
              />
            </Field>
            <Field
              id="a-tags"
              label="Tags"
              hint={`Comma-separated, up to ${ARTICLE_LIMITS.tags}.`}
            >
              <Input
                id="a-tags"
                value={tagText}
                onChange={(e) => edit(setTagText)(e.target.value)}
              />
            </Field>
            <details
              className="border-border rounded-lg border p-3"
              open={Boolean(seoTitle || seoDescription)}
            >
              <summary className="cursor-pointer text-sm font-medium">
                Search & sharing
              </summary>
              <div className="mt-3 space-y-4">
                <Field id="a-seo-title" label="SEO title">
                  <Input
                    id="a-seo-title"
                    maxLength={ARTICLE_LIMITS.seoTitle}
                    placeholder={title}
                    value={seoTitle}
                    onChange={(e) => edit(setSeoTitle)(e.target.value)}
                  />
                </Field>
                <Field id="a-seo-desc" label="SEO description">
                  <Textarea
                    id="a-seo-desc"
                    rows={3}
                    maxLength={ARTICLE_LIMITS.seoDescription}
                    value={seoDescription}
                    onChange={(e) => edit(setSeoDescription)(e.target.value)}
                  />
                </Field>
              </div>
            </details>
          </fieldset>

          {status === "published" && (
            <p className="text-muted-foreground text-xs leading-5">
              Published in Folioone. To show it on your public website, select
              it in{" "}
              <Link href="/website" className="underline">
                My Website → Content
              </Link>{" "}
              and republish. Unpublishing or archiving removes it from your
              public website immediately.
            </p>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this article?"
        description="This permanently deletes the article and removes it from your public website. This cannot be undone."
        confirmLabel="Delete article"
        tone="danger"
        pending={busy}
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Archive this article?"
        description="It will be removed from your public website immediately. You can restore it to drafts later."
        confirmLabel="Archive"
        pending={busy}
        onConfirm={() => {
          setConfirm(null);
          void transition("archived");
        }}
      />
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
