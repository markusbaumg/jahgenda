/* A minimal Markdown → HTML for the repo files the Mischpult shows (SKILL.md, criteria.md, bands.md):
 * headings, lists, fenced code, bold, inline code, http(s) links and paragraphs. Everything is escaped
 * first, so the output is safe for {@html}; only http(s) links become anchors. Pure. */
import { escape } from "./text.js";

const inline = (t) =>
  escape(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

const BULLET = /^\s*[-*] /;
const NUMBER = /^\s*\d+\. /;

export function markdown(src) {
  const out = [];
  const lines = String(src ?? "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(`<pre>${escape(buf.join("\n"))}</pre>`);
      continue;
    }
    const h = /^(#{1,4}) (.*)/.exec(l);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    const list = BULLET.test(l) ? [BULLET, "ul"] : NUMBER.test(l) ? [NUMBER, "ol"] : null;
    if (list) {
      const [re, tag] = list;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (!l.trim() || l.trim() === "---") {
      i++;
      continue;
    }
    const para = [l];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#|```|\s*[-*] |\s*\d+\. |---)/.test(lines[i]))
      para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}
