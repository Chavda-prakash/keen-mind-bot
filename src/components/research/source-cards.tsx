import { ExternalLink, FileText } from "lucide-react";

export interface SourceCardData {
  marker: number;
  url: string | null;
  title: string;
  domain: string;
  publishedAt?: string | null;
  excerpt?: string;
  kind: "web" | "file";
  page?: number | null;
}

export function SourceCards({ sources }: { sources: SourceCardData[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {sources.map((s) => (
        <a
          key={`${s.marker}-${s.url ?? s.title}`}
          id={`source-${s.marker}`}
          href={s.url ?? undefined}
          target={s.url ? "_blank" : undefined}
          rel="noreferrer noopener"
          className="group rounded-xl border border-border bg-card/60 p-3 transition-colors hover:border-primary/50 hover:bg-card"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary/15 px-1 text-[0.65rem] font-semibold text-primary">
              {s.marker}
            </span>
            {s.kind === "file" ? <FileText className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
            <span className="truncate">{s.domain}</span>
            {s.page ? <span>p.{s.page}</span> : null}
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{s.title}</p>
          {s.excerpt ? (
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{s.excerpt}</p>
          ) : null}
          {s.publishedAt ? (
            <p className="mt-2 text-[0.7rem] text-muted-foreground">{s.publishedAt.slice(0, 10)}</p>
          ) : null}
        </a>
      ))}
    </div>
  );
}
