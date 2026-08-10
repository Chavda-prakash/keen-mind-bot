import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteFile, ingestTextDocument, listFiles } from "@/lib/files.functions";
import { getWorkspace } from "@/lib/research.functions";

export const Route = createFileRoute("/_authenticated/knowledge")({
  component: KnowledgePage,
});

function KnowledgePage() {
  const fetchWorkspace = useServerFn(getWorkspace);
  const fetchFiles = useServerFn(listFiles);
  const ingest = useServerFn(ingestTextDocument);
  const remove = useServerFn(deleteFile);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace({}) });
  const files = useQuery({ queryKey: ["files"], queryFn: () => fetchFiles({}) });

  const removeMutation = useMutation({
    mutationFn: (fileId: string) => remove({ data: { fileId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["files"] }),
  });

  const upload = async (fileList: FileList | null) => {
    const workspaceId = workspace.data?.id;
    if (!fileList || !workspaceId) return;
    setBusy(true);
    try {
      for (const file of Array.from(fileList)) {
        const content = await file.text();
        await ingest({
          data: {
            workspaceId,
            name: file.name,
            mimeType: file.type || "text/plain",
            content,
          },
        });
        toast.success(`Indexed ${file.name}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["files"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10">
      <Link to="/research" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to research
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Knowledge files</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload plain-text documents (.txt, .md, .csv, .json). They are chunked, embedded, and searched in
        Knowledge Research mode.
      </p>

      <label className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-sm text-muted-foreground hover:border-primary/50">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {busy ? "Indexing…" : "Click to choose text documents"}
        <input
          type="file"
          multiple
          accept=".txt,.md,.csv,.json,text/plain,text/markdown"
          className="hidden"
          disabled={busy}
          onChange={(e) => upload(e.target.files)}
        />
      </label>

      <ul className="mt-6 space-y-2">
        {(files.data ?? []).map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{f.name}</p>
              <p className="text-xs text-muted-foreground">
                {f.status}
                {f.page_count ? ` · ${f.page_count} chunks` : ""}
                {f.error ? ` · ${f.error}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => removeMutation.mutate(f.id)} aria-label={`Delete ${f.name}`}>
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
