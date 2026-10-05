import type { ReactNode } from "react";

// Tiny, dependency-free renderer for the storage set-up guides (headings,
// paragraphs, bullet/numbered lists incl. one nested level, **bold**, *italic*,
// `code`). Builds React elements only — never injects HTML — so guide text can
// never run script. Not a general Markdown engine.
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Item = { text: string; children: string[] };

export function MarkdownLite({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2]);
      blocks.push(level === 1 ? <h3 key={key++}>{content}</h3> : level === 2 ? <h4 key={key++}>{content}</h4> : <h5 key={key++}>{content}</h5>);
      i++;
      continue;
    }
    const listStart = /^(\d+\.|-)\s+(.*)$/.exec(line);
    if (listStart) {
      const ordered = /^\d+\./.test(line);
      const items: Item[] = [];
      while (i < lines.length) {
        const top = /^(\d+\.|-)\s+(.*)$/.exec(lines[i]);
        const nested = /^\s{2,}-\s+(.*)$/.exec(lines[i]);
        if (top && /^\d+\./.test(lines[i]) === ordered) items.push({ text: top[2], children: [] });
        else if (nested && items.length) items[items.length - 1].children.push(nested[1]);
        else if (!lines[i].trim() && /^(\d+\.|-)\s/.test(lines[i + 1] ?? "") && /^\d+\./.test(lines[i + 1] ?? "") === ordered) { /* blank line inside a list */ }
        else break;
        i++;
      }
      const rendered = items.map((item, n) => (
        <li key={n}>
          {inline(item.text)}
          {item.children.length > 0 && <ul>{item.children.map((child, c) => <li key={c}>{inline(child)}</li>)}</ul>}
        </li>
      ));
      blocks.push(ordered ? <ol key={key++}>{rendered}</ol> : <ul key={key++}>{rendered}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\d+\.\s|-\s)/.test(lines[i])) paragraph.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(paragraph.join(" "))}</p>);
  }
  return <div className="markdown-lite">{blocks}</div>;
}
