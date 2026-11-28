import type { ReactNode } from "react";

// Light markdown for lesson pages (2026-11-28): ## headings, - / 1. lists, | tables |, > Safety: / > Note: callouts, **bold**.
// Rendered to React elements (never as HTML), so lesson text can never inject markup.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={`${keyBase}-b${i++}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(lines: string[], keyBase: string): ReactNode[] {
  return lines.flatMap((l, i) => (i === 0 ? inline(l, `${keyBase}-${i}`) : [<br key={`${keyBase}-br${i}`} />, ...inline(l, `${keyBase}-${i}`)]));
}

export function renderBlocks(text: string): ReactNode[] {
  const blocks = (text ?? "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
  return blocks.map((block, bi) => {
    const lines = block.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim().length > 0);
    const key = `blk-${bi}`;
    if (!lines.length) return null;
    const first = lines[0].trim();
    const h = /^(#{1,3})\s+(.*)$/.exec(first);
    if (h && lines.length === 1) return h[1].length >= 3 ? <h3 key={key}>{inline(h[2], key)}</h3> : <h2 key={key}>{inline(h[2], key)}</h2>;
    if (lines.every((l) => l.trim().startsWith(">"))) {
      const body = lines.map((l) => l.trim().replace(/^>\s?/, ""));
      const kind = /^(safety|warning|danger)\b/i.test(body[0]) ? "safety" : "note";
      const label = /^(\w+)\s*:\s*/.exec(body[0]);
      if (label) body[0] = body[0].slice(label[0].length);
      return <div key={key} className={`callout ${kind}`}>{label && <b>{label[1][0].toUpperCase() + label[1].slice(1).toLowerCase()}</b>}{withBreaks(body.filter(Boolean), key)}</div>;
    }
    if (lines.every((l) => /^\s*\|.*\|\s*$/.test(l))) {
      const rows = lines.filter((l) => !/^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(l)).map((l) => l.trim().slice(1, -1).split("|").map((c) => c.trim()));
      const hasHeader = lines.length > 1 && /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(lines[1]);
      const head: string[] | null = hasHeader ? rows[0] : null;
      const body: string[][] = hasHeader ? rows.slice(1) : rows;
      return (
        <div key={key} style={{ overflowX: "auto" }}>
          <table>
            {head && <thead><tr>{head.map((c, i) => <th key={i}>{inline(c, `${key}-h${i}`)}</th>)}</tr></thead>}
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `${key}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    const bullet = /^\s*[-*•]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    const bullets = lines.filter((l) => bullet.test(l)).length;
    const numbers = lines.filter((l) => numbered.test(l)).length;
    if (bullets && bullets >= lines.length - 1) {
      const lead = bullet.test(lines[0]) ? null : lines[0];
      const items = (lead ? lines.slice(1) : lines).map((l) => l.replace(bullet, ""));
      return <div key={key}>{lead && <p>{inline(lead, `${key}-lead`)}</p>}<ul>{items.map((t, i) => <li key={i}>{inline(t, `${key}-${i}`)}</li>)}</ul></div>;
    }
    if (numbers >= 2 && numbers >= lines.length - 1) {
      const lead = numbered.test(lines[0]) ? null : lines[0];
      const items = (lead ? lines.slice(1) : lines).map((l) => l.replace(numbered, ""));
      return <div key={key}>{lead && <p>{inline(lead, `${key}-lead`)}</p>}<ol>{items.map((t, i) => <li key={i}>{inline(t, `${key}-${i}`)}</li>)}</ol></div>;
    }
    if (h) return <div key={key}>{h[1].length >= 3 ? <h3>{inline(h[2], key)}</h3> : <h2>{inline(h[2], key)}</h2>}<p>{withBreaks(lines.slice(1), key)}</p></div>;
    return <p key={key}>{withBreaks(lines, key)}</p>;
  });
}

export function Markdown({ text, className = "tt-md" }: { text: string; className?: string }) {
  return <div className={className}>{renderBlocks(text)}</div>;
}
