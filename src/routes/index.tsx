import { Link, createFileRoute } from "@tanstack/react-router";
import { Compass, FileSearch, Quote, Search } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CIEL — Cited AI Research Agent" },
      {
        name: "description",
        content:
          "CIEL is a personal AI research agent: real web search, sources you can open, inline citations, deep research and document Q&A.",
      },
      { property: "og:title", content: "CIEL — Cited AI Research Agent" },
      {
        property: "og:description",
        content: "Evidence-first AI research with real sources, inline citations and deep research workflows.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Compass className="h-5 w-5" />
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Research that shows its sources
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
          CIEL plans a research strategy, searches the live web, reads the pages it finds, verifies each
          claim against retrieved evidence, and answers with inline citations you can open.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/research"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Start researching
          </Link>
          <Link to="/knowledge" className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium">
            Knowledge files
          </Link>
        </div>

        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          {[
            { icon: Search, title: "Real web search", body: "Multiple queries per question, with provider failover. No invented results." },
            { icon: Quote, title: "Verified citations", body: "Markers are mapped back to the passage that supports them." },
            { icon: FileSearch, title: "Your documents", body: "Upload files and research them with the same cited pipeline." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card/60 p-4">
              <f.icon className="h-4 w-4 text-primary" />
              <h2 className="mt-3 text-sm font-semibold">{f.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
