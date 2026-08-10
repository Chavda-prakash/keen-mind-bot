import { Fragment, type ReactNode } from "react";

export interface CitationTarget {
  marker: number;
  url: string | null;
  title: string;
  domain: string;
}

/**
 * Small markdown renderer for model answers. Citation markers like [3] become
 * clickable chips that link to the real source; unknown markers render as text.
 */
export function AnswerMarkdown({
  text,
  sources,
  onCitationClick,
}: {
  text: string;
  sources?: CitationTarget[];
  onCitationClick?: (marker: number) => void;
}) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[0.95rem] leading-relaxed">
      {blocks.map((block, i) => (
        <Block key={i} block={block} sources={sources} onCitationClick={onCitationClick} />
      ))}
    </div>
  );
}

function Block({
  block,
  sources,
  onCitationClick,
}: {
  block: string;
  sources?: CitationTarget[];
  onCitationClick?: (marker: number) => void;
}) {
  const lines = block.split("\n");

  if (block.startsWith("```")) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs">
        <code>{block.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "")}</code>
      </pre>
    );
  }

  const heading = block.match(/^(#{1,4})\s+(.*)$/);
  if (heading) {
    const level = heading[1]!.length;
    const cls =
      level <= 2 ? "text-lg font-semibold tracking-tight" : "text-base font-semibold tracking-tight";
    return <h3 className={cls}>{inline(heading[2] ?? "", sources, onCitationClick)}</h3>;
  }

  if (lines.every((l) => /^\s*[-*•]\s+/.test(l) || !l.trim())) {
    return (
      <ul className="ml-4 list-disc space-y-1.5">
        {lines.filter((l) => l.trim()).map((l, i) => (
          <li key={i}>{inline(l.replace(/^\s*[-*•]\s+/, ""), sources, onCitationClick)}</li>
        ))}
      </ul>
    );
  }

  if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l) || !l.trim())) {
    return (
      <ol className="ml-4 list-decimal space-y-1.5">
        {lines.filter((l) => l.trim()).map((l, i) => (
          <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), sources, onCitationClick)}</li>
        ))}
      </ol>
    );
  }

  return <p>{inline(block, sources, onCitationClick)}</p>;
}

function inline(
  text: string,
  sources?: CitationTarget[],
  onCitationClick?: (marker: number) => void,
): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[(\d{1,2})\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    if (match[1]) parts.push(<strong key={key++} className="font-semibold">{match[1]}</strong>);
    else if (match[2]) parts.push(<em key={key++}>{match[2]}</em>);
    else if (match[3])
      parts.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {match[3]}
        </code>,
      );
    else if (match[4]) {
      const marker = Number(match[4]);
      const source = sources?.find((s) => s.marker === marker);
      parts.push(
        <button
          key={key++}
          type="button"
          title={source ? `${source.title} — ${source.domain}` : `Source ${marker}`}
          onClick={() => onCitationClick?.(marker)}
          className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary/15 px-1 align-super text-[0.65rem] font-semibold text-primary transition-colors hover:bg-primary/30"
        >
          {marker}
        </button>,
      );
    } else if (match[5] && match[6]) {
      parts.push(
        <a
          key={key++}
          href={match[6]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2"
        >
          {match[5]}
        </a>,
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return parts;
}
