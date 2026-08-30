import type { ReactNode } from "react";

/**
 * Minimal, dependency-free renderer for the constrained markdown subset the
 * analyst produces (## headings, bullets, numbered lists, **bold**, _em_).
 * Nothing is rendered as raw HTML, so model output can never inject markup.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Narrative({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    const items = list.items;
    blocks.push(
      <Tag key={`l-${blocks.length}`}>
        {items.map((item, i) => (
          <li key={i}>{inline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ");
    blocks.push(<p key={`p-${blocks.length}`}>{inline(text, `p-${blocks.length}`)}</p>);
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = (heading[1] ?? "#").length;
      const content = inline(heading[2] ?? "", `h-${blocks.length}`);
      blocks.push(
        level <= 2 ? (
          <h2 key={`h-${blocks.length}`}>{content}</h2>
        ) : (
          <h3 key={`h-${blocks.length}`}>{content}</h3>
        ),
      );
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1] ?? "");
      continue;
    }
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1] ?? "");
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();

  return <div className="prose-brief text-sm text-foreground/90">{blocks}</div>;
}
