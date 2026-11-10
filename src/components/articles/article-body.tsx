import { Fragment, type ReactNode } from "react";
import type { RichDoc, RichMark, RichNode } from "@/domains/articles/rich-text";

/**
 * Renders a sanitised article document. The same component draws the editor's preview and the
 * public page, so they match. It builds React elements from the JSON (no HTML strings), and only
 * http(s) URLs ever reach href/src.
 */
function mark(node: ReactNode, m: RichMark, key: number): ReactNode {
  switch (m.type) {
    case "bold":
      return <strong key={key}>{node}</strong>;
    case "italic":
      return <em key={key}>{node}</em>;
    case "code":
      return (
        <code key={key} className="article-code">
          {node}
        </code>
      );
    case "link":
      return (
        <a
          key={key}
          href={m.attrs.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {node}
        </a>
      );
  }
}

function inline(node: RichNode, key: number): ReactNode {
  if (node.type === "hardBreak") return <br key={key} />;
  let out: ReactNode = node.text ?? "";
  (node.marks ?? []).forEach((m, i) => (out = mark(out, m, i)));
  return <Fragment key={key}>{out}</Fragment>;
}

function blocks(nodes: RichNode[] | undefined): ReactNode[] {
  return (nodes ?? []).map((n, i) => block(n, i));
}

function block(node: RichNode, key: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return node.content?.length ? (
        <p key={key}>{node.content.map(inline)}</p>
      ) : null;
    case "heading":
      return node.attrs?.level === 3 ? (
        <h3 key={key}>{(node.content ?? []).map(inline)}</h3>
      ) : (
        <h2 key={key}>{(node.content ?? []).map(inline)}</h2>
      );
    case "blockquote":
      return <blockquote key={key}>{blocks(node.content)}</blockquote>;
    case "bulletList":
      return <ul key={key}>{blocks(node.content)}</ul>;
    case "orderedList":
      return <ol key={key}>{blocks(node.content)}</ol>;
    case "listItem":
      return <li key={key}>{blocks(node.content)}</li>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{node.content?.[0]?.text ?? ""}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return (
        <figure key={key}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={String(node.attrs?.src)}
            alt={alt}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          {alt && <figcaption>{alt}</figcaption>}
        </figure>
      );
    }
    default:
      return null;
  }
}

export function ArticleBody({
  doc,
  className = "",
}: {
  doc: RichDoc;
  className?: string;
}) {
  return (
    <div className={`article-prose ${className}`} data-testid="article-body">
      {blocks(doc.content)}
    </div>
  );
}
