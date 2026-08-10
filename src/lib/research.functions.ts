import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ModeSchema = z.enum(["quick", "deep", "files", "local"]);

/** Returns (creating if needed) the caller's default workspace. */
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing } = await context.supabase
      .from("workspaces")
      .select("id,name,description,instructions,local_mode")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) return existing;
    const { data, error } = await context.supabase
      .from("workspaces")
      .insert({ owner_id: context.userId, name: "Personal", description: "Default workspace" })
      .select("id,name,description,instructions,local_mode")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select("id,title,mode,updated_at")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: conversation, error } = await context.supabase
      .from("conversations")
      .select("id,title,mode")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conversation) return null;
    const { data: messages } = await context.supabase
      .from("messages")
      .select("id,role,content,data,run_id,created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    return { conversation, messages: messages ?? [] };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("conversations").delete().eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Full research turn: persists the question, runs the agent pipeline, and
 * stores the cited answer on the conversation.
 */
export const askQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid().nullable().optional(),
        workspaceId: z.string().uuid(),
        question: z.string().min(1).max(4000),
        mode: ModeSchema.default("quick"),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { runResearch } = await import("@/core/agent/orchestrator.server");
    const db = context.supabase;

    const { data: workspace } = await db
      .from("workspaces")
      .select("id,instructions")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (!workspace) throw new Error("workspace not found");

    let conversationId = data.conversationId ?? null;
    if (!conversationId) {
      const { data: created, error } = await db
        .from("conversations")
        .insert({
          workspace_id: data.workspaceId,
          user_id: context.userId,
          title: data.question.slice(0, 80),
          mode: data.mode,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      conversationId = created.id as string;
    }

    const { data: priorMessages } = await db
      .from("messages")
      .select("role,content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    await db.from("messages").insert({
      conversation_id: conversationId,
      user_id: context.userId,
      role: "user",
      content: data.question,
      data: { mode: data.mode },
    });

    try {
      const result = await runResearch({
        db,
        userId: context.userId,
        workspaceId: data.workspaceId,
        conversationId,
        question: data.question,
        mode: data.mode,
        history: (priorMessages ?? []) as { role: string; content: string }[],
        workspaceInstructions: workspace.instructions ?? null,
      });

      const payload = {
        sources: result.evidence.map((e) => ({
          marker: e.marker,
          url: e.url,
          title: e.title,
          domain: e.domain,
          publishedAt: e.publishedAt,
          excerpt: e.excerpt.slice(0, 400),
          kind: e.kind,
          page: e.page ?? null,
        })),
        citations: result.citations,
        evaluation: result.evaluation,
        followUps: result.followUps,
        provider: result.provider,
        model: result.model,
        mode: data.mode,
        latencyMs: result.latencyMs,
      };

      const { data: assistantMessage } = await db
        .from("messages")
        .insert({
          conversation_id: conversationId,
          user_id: context.userId,
          role: "assistant",
          content: result.answer,
          data: payload as never,
          run_id: result.runId,
        })
        .select("id")
        .single();

      await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

      return {
        conversationId,
        messageId: assistantMessage?.id ?? null,
        answer: result.answer,
        ...payload,
      };
    } catch (err) {
      const message = (err as Error).message;
      await db.from("messages").insert({
        conversation_id: conversationId,
        user_id: context.userId,
        role: "assistant",
        content: `I couldn't complete this research run: ${message}`,
        data: { error: message, mode: data.mode },
      });
      throw new Error(message);
    }
  });

export const listMemories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("memories")
      .select("id,content,kind,pinned,importance,created_at")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const addMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        content: z.string().min(2).max(2000),
        pinned: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("memories").insert({
      workspace_id: data.workspaceId,
      user_id: context.userId,
      content: data.content,
      kind: "fact",
      pinned: data.pinned,
      importance: data.pinned ? 3 : 1,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("memories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
