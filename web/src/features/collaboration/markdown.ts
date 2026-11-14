/**
 * @author Aashwat Singh
 * @description A small, safe Markdown parser for comments and task descriptions. It turns text into a tree
 *   of plain data (paragraphs, lists, quotes, code, bold, italic, links, @mentions) that React renders as
 *   ordinary elements - raw HTML is never inserted, and links are only allowed for http, https and mailto.
 *   This is the browser-side half of the XSS defence (the server sanitizes too).
 *   Every pattern is written so the parser's work grows in step with the length of the text (no
 *   catastrophic backtracking), and text longer than the server allows is not parsed at all.
 * @traces SE-FR-28, UC-21
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'mention'; username: string };

export type Block =
  | { type: 'p'; children: Inline[] }
  | { type: 'ul'; items: Inline[][] }
  | { type: 'ol'; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'code'; text: string };

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

export function safeHref(raw: string): string | null {
  const url = raw.trim().replace(/[\u0000-\u001f\u007f\s]+/g, '');
  try {
    const parsed = new URL(url);
    return SAFE_SCHEMES.includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** The longest text the server stores in one field (task description); longer input is shown as plain text. */
export const MAX_MARKDOWN_LENGTH = 20000;

// Link alternative: [label](target).
//   label  = [^\[\]\n]{1,500}   cannot contain "[" so a run of "[[[[..." is abandoned at the next "["
//   target = [^()\s]{1,2000}, optionally one "(...)" group, then [^()\s]{0,2000}
// The three target pieces use the same class WITHOUT parentheses, so there is exactly one way to split a
// target between them. The earlier form ([^)\s]+(?:\([^)\s]*\))?[^)\s]*) let "(" match in every piece;
// a comment like "[a]([a]([a](..." then took time cubic in its length (30+ seconds for 8,000 characters).
const INLINE_PATTERN = /`([^`\n]+)`|\[([^[\]\n]{1,500})\]\(([^()\s]{1,2000}(?:\([^()\s]{0,500}\)[^()\s]{0,2000})?)\)|\*\*([^*\n]+?)\*\*|(?<![\w*])\*([^*\n]+?)\*(?![\w*])|(?<![\w_])_([^_\n]+?)_(?![\w_])|(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{3,30})(?![A-Za-z0-9_])|(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"])/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  // A fresh RegExp per call: parseInline recurses, and a shared global regex's lastIndex would be clobbered.
  const re = new RegExp(INLINE_PATTERN.source, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    const [whole, code, linkText, linkHref, strong, em1, em2, mention, url] = m;
    if (code !== undefined) out.push({ type: 'code', text: code });
    else if (linkText !== undefined) {
      const href = safeHref(linkHref);
      if (href) out.push({ type: 'link', href, children: parseInline(linkText) });
      else out.push({ type: 'text', text: linkText });
    } else if (strong !== undefined) out.push({ type: 'strong', children: parseInline(strong) });
    else if (em1 !== undefined || em2 !== undefined) out.push({ type: 'em', children: parseInline(em1 ?? em2) });
    else if (mention !== undefined) out.push({ type: 'mention', username: mention });
    else if (url !== undefined) {
      const href = safeHref(url);
      out.push(href ? { type: 'link', href, children: [{ type: 'text', text: url }] } : { type: 'text', text: url });
    } else out.push({ type: 'text', text: whole });
    last = m.index + whole.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  if (source.length > MAX_MARKDOWN_LENGTH) return [{ type: 'code', text: source.slice(0, MAX_MARKDOWN_LENGTH) }];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) items.push(parseInline(lines[i++].replace(/^\s*[-*+]\s+/, '')));
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(parseInline(lines[i++].replace(/^\s*\d+[.)]\s+/, '')));
      blocks.push({ type: 'ol', items });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', children: parseInline(quote.join(' ')) });
      continue;
    }
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*([-*+]\s+|\d+[.)]\s+|>|```)/.test(lines[i])) para.push(lines[i++]);
    blocks.push({ type: 'p', children: parseInline(para.join('\n')) });
  }
  return blocks;
}

export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?<![A-Za-z0-9_@])@([A-Za-z0-9_]{3,30})(?![A-Za-z0-9_])/g)) out.add(m[1]);
  return [...out];
}
