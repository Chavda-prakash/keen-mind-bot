import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ownerContext } from "@/lib/owner-context";

export const listFiles = createServerFn({ method: "GET" })
  .middleware([ownerContext])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("files")
      .select("id,name,mime_type,size_bytes,status,error,page_count,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Ingests a plain-text document: stores the file row, chunks the text, embeds
 * every chunk, and writes the vectors used by knowledge_search.
 */
export const ingestTextDocument = createServerFn({ method: "POST" })
  .middleware([ownerContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(300),
        mimeType: z.string().max(200).default("text/plain"),
        content: z.string().min(1).max(2_000_000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { chunkText } = await import("@/core/rag/chunk");
    const { embedTexts } = await import("@/core/providers/embeddings/index.server");
    const db = context.supabase;

    const { data: file, error } = await db
      .from("files")
      .insert({
        workspace_id: data.workspaceId,
        user_id: context.userId,
        name: data.name,
        mime_type: data.mimeType,
        size_bytes: data.content.length,
        status: "processing",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const fileId = file.id as string;

    try {
      const chunks = chunkText(data.content);
      if (chunks.length === 0) throw new Error("document contained no readable text");

      for (let i = 0; i < chunks.length; i += 32) {
        const batch = chunks.slice(i, i + 32);
        const { vectors } = await embedTexts(batch.map((c) => c.content));
        const rows = batch.map((c, j) => ({
          file_id: fileId,
          workspace_id: data.workspaceId,
          user_id: context.userId,
          chunk_index: c.index,
          page: c.page,
          content: c.content,
          token_estimate: c.tokenEstimate,
          embedding: JSON.stringify(vectors[j] ?? []),
          model_version: "text-embedding-3-small-1536",
        }));
        const { error: chunkError } = await db.from("file_chunks").insert(rows);
        if (chunkError) throw new Error(chunkError.message);
      }

      await db.from("files").update({ status: "ready", page_count: chunks.length }).eq("id", fileId);
      await db.from("audit_events").insert({
        user_id: context.userId,
        workspace_id: data.workspaceId,
        action: "file_ingested",
        target: fileId,
        detail: { name: data.name, chunks: chunks.length },
      });
      return { fileId, chunks: chunks.length };
    } catch (err) {
      const message = (err as Error).message;
      await db.from("files").update({ status: "failed", error: message }).eq("id", fileId);
      throw new Error(message);
    }
  });

export const deleteFile = createServerFn({ method: "POST" })
  .middleware([ownerContext])
  .inputValidator((input: unknown) => z.object({ fileId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("files").delete().eq("id", data.fileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
