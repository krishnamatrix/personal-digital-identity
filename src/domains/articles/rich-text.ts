/**
 * Article body: a restricted ProseMirror/Tiptap JSON document.
 *
 * Bodies are stored as JSON (never HTML) and rendered by our own React renderer, so there is no
 * `dangerouslySetInnerHTML` anywhere. Every document - from the editor, from the database, from a
 * published snapshot - passes through `sanitizeDoc`, which rebuilds it from an allowlist of nodes,
 * marks and attributes and caps its size and depth.
 */
export type RichMark =
  | { type: "bold" | "italic" | "code" }
  | { type: "link"; attrs: { href: string } };

export type RichNode = {
  type: string;
  attrs?: Record<string, string | number | null>;
  content?: RichNode[];
  marks?: RichMark[];
  text?: string;
};
export type RichDoc = { type: "doc"; content: RichNode[] };

export const EMPTY_DOC: RichDoc = { type: "doc", content: [] };

const MAX_NODES = 6000;
const MAX_DEPTH = 8;
const MAX_TEXT = 100_000;
const HTTP = /^https?:\/\/[^\s]+$/;

export const isHttpUrl = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 2000 && HTTP.test(value);

const BLOCKS_IN_ITEM = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "codeBlock",
  "horizontalRule",
  "image",
]);
const TOP_LEVEL = BLOCKS_IN_ITEM;

type Budget = { nodes: number };

function cleanMarks(raw: unknown): RichMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: RichMark[] = [];
  for (const m of raw) {
    const type = (m as { type?: unknown })?.type;
    if (type === "bold" || type === "italic" || type === "code") {
      if (!out.some((x) => x.type === type)) out.push({ type });
    } else if (type === "link") {
      const href = (m as { attrs?: { href?: unknown } }).attrs?.href;
      if (isHttpUrl(href) && !out.some((x) => x.type === "link"))
        out.push({ type: "link", attrs: { href } });
    }
  }
  return out.length ? out : undefined;
}

function inline(raw: unknown, budget: Budget): RichNode | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as { type?: unknown; text?: unknown; marks?: unknown };
  if (budget.nodes++ > MAX_NODES) return null;
  if (n.type === "hardBreak") return { type: "hardBreak" };
  if (n.type === "text" && typeof n.text === "string" && n.text !== "") {
    const marks = cleanMarks(n.marks);
    return marks
      ? { type: "text", text: n.text.slice(0, MAX_TEXT), marks }
      : { type: "text", text: n.text.slice(0, MAX_TEXT) };
  }
  return null;
}

function inlines(raw: unknown, budget: Budget): RichNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) => {
    const node = inline(c, budget);
    return node ? [node] : [];
  });
}

function block(
  raw: unknown,
  budget: Budget,
  depth: number,
  allowed: Set<string>,
): RichNode | null {
  if (!raw || typeof raw !== "object" || depth > MAX_DEPTH) return null;
  const n = raw as {
    type?: unknown;
    attrs?: Record<string, unknown>;
    content?: unknown;
  };
  if (typeof n.type !== "string" || !allowed.has(n.type)) return null;
  if (budget.nodes++ > MAX_NODES) return null;

  const children = (set: Set<string>) =>
    (Array.isArray(n.content) ? n.content : []).flatMap((c) => {
      const b = block(c, budget, depth + 1, set);
      return b ? [b] : [];
    });

  switch (n.type) {
    case "paragraph": {
      const content = inlines(n.content, budget);
      return content.length
        ? { type: "paragraph", content }
        : { type: "paragraph" };
    }
    case "heading": {
      const level = n.attrs?.level === 3 ? 3 : 2;
      return {
        type: "heading",
        attrs: { level },
        content: inlines(n.content, budget),
      };
    }
    case "blockquote": {
      const content = children(BLOCKS_IN_ITEM);
      return content.length ? { type: "blockquote", content } : null;
    }
    case "bulletList":
    case "orderedList": {
      const content = children(new Set(["listItem"]));
      return content.length ? { type: n.type, content } : null;
    }
    case "listItem": {
      const content = children(BLOCKS_IN_ITEM);
      return content.length ? { type: "listItem", content } : null;
    }
    case "codeBlock": {
      const text = (Array.isArray(n.content) ? n.content : [])
        .map((c) =>
          typeof (c as { text?: unknown })?.text === "string"
            ? (c as { text: string }).text
            : "",
        )
        .join("")
        .slice(0, MAX_TEXT);
      return text
        ? { type: "codeBlock", content: [{ type: "text", text }] }
        : { type: "codeBlock" };
    }
    case "horizontalRule":
      return { type: "horizontalRule" };
    case "image": {
      const src = n.attrs?.src;
      if (!isHttpUrl(src)) return null;
      const alt =
        typeof n.attrs?.alt === "string" ? n.attrs.alt.slice(0, 300) : null;
      return { type: "image", attrs: { src, alt } };
    }
    default:
      return null;
  }
}

/** Rebuilds any value into a valid, bounded document. Unknown content is dropped, never trusted. */
export function sanitizeDoc(raw: unknown): RichDoc {
  const budget: Budget = { nodes: 0 };
  const content =
    raw && typeof raw === "object" && Array.isArray((raw as RichDoc).content)
      ? (raw as RichDoc).content
      : [];
  return {
    type: "doc",
    content: content.flatMap((c) => {
      const b = block(c, budget, 1, TOP_LEVEL);
      return b ? [b] : [];
    }),
  };
}

function walkText(node: RichNode, out: string[]) {
  if (node.type === "text" && node.text) out.push(node.text);
  else if (node.type === "hardBreak") out.push(" ");
  for (const child of node.content ?? []) walkText(child, out);
  if (
    ["paragraph", "heading", "listItem", "codeBlock", "blockquote"].includes(
      node.type,
    )
  )
    out.push("\n");
}

/** Plain text of a document (used for search, excerpts and counts). */
export function plainText(doc: RichDoc): string {
  const out: string[] = [];
  for (const node of doc.content) walkText(node, out);
  return out
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function wordCount(doc: RichDoc): number {
  const text = plainText(doc);
  return text ? text.split(/\s+/).length : 0;
}

/** 220 words a minute; a non-empty article always reads for at least one minute. */
export function readingMinutes(words: number): number {
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / 220));
}

export function isBlank(doc: RichDoc): boolean {
  return plainText(doc) === "" && !doc.content.some((n) => n.type === "image");
}

export function deriveExcerpt(doc: RichDoc, max = 200): string {
  const text = plainText(doc).replace(/\s+/g, " ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "") + "…";
}
