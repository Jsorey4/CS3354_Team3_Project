/**
 * @author Aashwat Singh
 * @description Unit tests: the Markdown renderer's parser keeps formatting and mentions, never produces
 *   javascript: / data: / vbscript: links however they are disguised, treats raw HTML as plain text, and
 *   stays fast on text built to make a careless pattern take minutes (ReDoS).
 * @traces SE-FR-28, SE-FR-29, UC-21
 */
import { describe, expect, it } from 'vitest';
import { MAX_MARKDOWN_LENGTH, extractMentions, parseInline, parseMarkdown, safeHref, type Inline } from './markdown';

describe('UC-21 safe markdown', () => {
  it('parses bold, italic, code and mentions', () => {
    const nodes = parseInline('**bold** *it* `x<y` @staff');
    expect(nodes.map((n) => n.type)).toEqual(['strong', 'text', 'em', 'text', 'code', 'text', 'mention']);
  });
  it('drops dangerous link targets but keeps the label as text', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ type: 'text', text: 'click' }]);
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('JAVA\tSCRIPT:alert(1)')).toBeNull();
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
  });
  it('builds lists, quotes and code blocks', () => {
    const blocks = parseMarkdown('- one\n- two\n\n> quoted\n\n```\ncode\n```');
    expect(blocks.map((b) => b.type)).toEqual(['ul', 'quote', 'code']);
  });
  it('extracts mentions but not emails', () => {
    expect(extractMentions('hi @tyler and a@b.com @staff @tyler')).toEqual(['tyler', 'staff']);
  });
  it('UC-21: refuses every script-capable link scheme, however it is spelled (SE-FR-28)', () => {
    const hostile = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      ' \u0001javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'file:///etc/passwd',
      'jav&#x09;ascript:alert(1)',
      '&#106;avascript:alert(1)',
      'blob:https://example.com/1',
    ];
    for (const target of hostile) expect(safeHref(target), target).toBeNull();
    expect(safeHref('mailto:team@example.com')).toBe('mailto:team@example.com');
    expect(safeHref('/relative/path')).toBeNull(); // only absolute http(s) and mailto links are rendered
  });
  it('UC-21: raw HTML is never turned into elements, only into text nodes (SE-FR-28)', () => {
    const payloads = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<svg onload=alert(1)>', '<iframe src="javascript:alert(1)"></iframe>', '<style>*{display:none}</style>'];
    const allowed = new Set(['text', 'code', 'strong', 'em', 'link', 'mention']);
    const walk = (nodes: Inline[]): void => {
      for (const node of nodes) {
        expect(allowed.has(node.type)).toBe(true);
        if (node.type === 'link') expect(node.href.startsWith('http') || node.href.startsWith('mailto:')).toBe(true);
        if ('children' in node) walk(node.children);
      }
    };
    for (const payload of payloads) {
      const nodes = parseInline(payload);
      walk(nodes);
      expect(nodes.every((n) => n.type !== 'link')).toBe(true);
    }
  });
  it('UC-21: parsing stays linear on text crafted to cause catastrophic backtracking (ReDoS)', () => {
    const probes = [
      '[a]('.repeat(5000), // cubic with the previous link pattern: 8,000 characters took over 30 seconds
      '['.repeat(20000),
      '[a](' + '('.repeat(19990),
      '*'.repeat(20000),
      '_a'.repeat(10000),
      '`a'.repeat(10000),
      '@'.repeat(20000),
      'http://a'.repeat(2500),
      '> ' + ' '.repeat(19990),
    ];
    const started = Date.now();
    for (const probe of probes) parseMarkdown(probe);
    expect(Date.now() - started).toBeLessThan(1000);
    // Longer than anything the server stores: shown as plain text without being parsed.
    expect(parseMarkdown('x'.repeat(MAX_MARKDOWN_LENGTH + 1))[0].type).toBe('code');
  });
  it('keeps links with balanced parentheses and query strings', () => {
    const nodes = parseInline('[docs](https://example.com/a_(b)) and [q](https://example.com/p?x=1)');
    expect(nodes.filter((n) => n.type === 'link').map((n) => (n.type === 'link' ? n.href : ''))).toEqual(['https://example.com/a_(b)', 'https://example.com/p?x=1']);
  });
});
