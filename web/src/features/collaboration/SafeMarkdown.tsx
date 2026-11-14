/**
 * @author Aashwat Singh
 * @description Renders parsed Markdown as React elements (never as raw HTML). @mentions of project members
 *   are highlighted; links open in a new tab with rel="noopener noreferrer".
 * @traces SE-FR-28, UC-21
 */
import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, type Inline } from './markdown';

function renderInline(nodes: Inline[], memberNames?: Set<string>): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>;
      case 'code':
        return <code key={i}>{node.text}</code>;
      case 'strong':
        return <strong key={i}>{renderInline(node.children, memberNames)}</strong>;
      case 'em':
        return <em key={i}>{renderInline(node.children, memberNames)}</em>;
      case 'link':
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-brand underline underline-offset-2">
            {renderInline(node.children, memberNames)}
          </a>
        );
      case 'mention': {
        const known = !memberNames || memberNames.has(node.username.toLowerCase());
        return (
          <span key={i} className={`rounded px-1 font-semibold ${known ? 'bg-brand/10 text-brand' : 'text-muted'}`}>
            @{node.username}
          </span>
        );
      }
      default:
        return null;
    }
  });
}

export function SafeMarkdown({ source, memberNames, className = '' }: { source: string; memberNames?: Set<string>; className?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={`markdown text-sm leading-relaxed ${className}`}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'p':
            return <p key={i} className="whitespace-pre-line">{renderInline(block.children, memberNames)}</p>;
          case 'ul':
            return <ul key={i}>{block.items.map((item, j) => <li key={j}>{renderInline(item, memberNames)}</li>)}</ul>;
          case 'ol':
            return <ol key={i}>{block.items.map((item, j) => <li key={j}>{renderInline(item, memberNames)}</li>)}</ol>;
          case 'quote':
            return <blockquote key={i}>{renderInline(block.children, memberNames)}</blockquote>;
          case 'code':
            return <pre key={i}><code>{block.text}</code></pre>;
          default:
            return null;
        }
      })}
    </div>
  );
}
