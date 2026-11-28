import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/tech-training/Markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("Tech Training: lesson text (light markdown)", () => {
  it("renders headings, lists, numbered steps and bold", () => {
    const out = html("## Before you start\n\nRead **all** steps.\n\n- Boots\n- Glasses\n\n1. Lower the body\n2. Fit the prop");
    expect(out).toContain("<h2>Before you start</h2>");
    expect(out).toContain("<strong>all</strong>");
    expect(out).toContain("<ul><li>Boots</li><li>Glasses</li></ul>");
    expect(out).toContain("<ol><li>Lower the body</li><li>Fit the prop</li></ol>");
  });
  it("renders tables and safety / note callouts", () => {
    const out = html("| Gas | Colour |\n| --- | --- |\n| Oxygen | Black |\n\n> Safety: Release accumulator pressure first.\n\n> Note: Check the manual.");
    expect(out).toContain("<th>Gas</th>");
    expect(out).toContain("<td>Oxygen</td>");
    expect(out).toContain('class="callout safety"><b>Safety</b>Release accumulator pressure first.');
    expect(out).toContain('class="callout note"');
  });
  it("never passes lesson text through as HTML", () => {
    const out = html("<script>alert(1)</script> and <b>bold</b>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
