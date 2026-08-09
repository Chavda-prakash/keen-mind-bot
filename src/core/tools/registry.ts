import { z } from "zod";

export type ToolPermission =
  | "web.search"
  | "web.read"
  | "web.browse"
  | "files.read"
  | "files.write"
  | "compute.safe"
  | "compute.code"
  | "db.read"
  | "export.write"
  | "workflow.trigger"
  | "connector.send";

export interface ToolContext {
  userId: string;
  workspaceId: string;
  runId: string | null;
  /** permissions granted for this run */
  granted: ToolPermission[];
  allowedDomains?: string[];
  signal?: AbortSignal | undefined;
  /**
   * Injected services (database client, embedding function, …). Kept loosely
   * typed so the registry stays independent of any storage vendor.
   */
  services?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db?: any;
    embed?: (text: string) => Promise<number[]>;
  };
  /** invoked for every attempt so the caller can persist an audit trail */
  audit?: (entry: ToolAuditEntry) => void | Promise<void>;
}

export interface ToolAuditEntry {
  toolName: string;
  input: unknown;
  output?: unknown;
  status: "ok" | "error" | "denied" | "timeout";
  attempt: number;
  durationMs: number;
  error?: string;
}

export interface ToolDefinition<I, O> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  permissions: ToolPermission[];
  timeoutMs: number;
  retries: number;
  /** irreversible or sensitive: requires explicit human approval */
  requiresApproval: boolean;
  /** local-mode safe (no live internet needed) */
  worksOffline: boolean;
  execute(input: I, ctx: ToolContext): Promise<O>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDefinition<any, any>;

export class ToolError extends Error {
  constructor(
    message: string,
    public kind: "denied" | "invalid_input" | "invalid_output" | "timeout" | "failed",
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export class ToolRegistry {
  private tools = new Map<string, AnyTool>();

  register(tool: AnyTool): this {
    if (this.tools.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  list(): AnyTool[] {
    return [...this.tools.values()];
  }

  /** Tools the agent may consider given granted permissions and offline mode. */
  available(opts: { granted: ToolPermission[]; offline?: boolean }): AnyTool[] {
    return this.list().filter(
      (t) =>
        t.permissions.every((p) => opts.granted.includes(p)) &&
        (!opts.offline || t.worksOffline),
    );
  }

  /** JSON descriptors handed to the model for tool selection. */
  describe(tools: AnyTool[] = this.list()) {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      requiresApproval: t.requiresApproval,
      permissions: t.permissions,
    }));
  }

  /**
   * Validated, timed, retried, audited execution. Model-generated arguments are
   * always schema-validated first; outputs are validated before being handed to
   * any later step.
   */
  async execute<I, O>(
    name: string,
    rawInput: unknown,
    ctx: ToolContext,
    opts: { approved?: boolean } = {},
  ): Promise<O> {
    const tool = this.tools.get(name) as ToolDefinition<I, O> | undefined;
    if (!tool) throw new ToolError(`unknown tool: ${name}`, "failed");

    const missing = tool.permissions.filter((p) => !ctx.granted.includes(p));
    if (missing.length > 0) {
      await ctx.audit?.({
        toolName: name,
        input: rawInput,
        status: "denied",
        attempt: 1,
        durationMs: 0,
        error: `missing permissions: ${missing.join(", ")}`,
      });
      throw new ToolError(`tool ${name} denied: missing ${missing.join(", ")}`, "denied");
    }
    if (tool.requiresApproval && !opts.approved) {
      await ctx.audit?.({
        toolName: name,
        input: rawInput,
        status: "denied",
        attempt: 1,
        durationMs: 0,
        error: "human approval required",
      });
      throw new ToolError(`tool ${name} requires human approval`, "denied");
    }

    const parsedInput = tool.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      await ctx.audit?.({
        toolName: name,
        input: rawInput,
        status: "error",
        attempt: 1,
        durationMs: 0,
        error: `invalid input: ${parsedInput.error.message}`,
      });
      throw new ToolError(`invalid input for ${name}: ${parsedInput.error.message}`, "invalid_input");
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= tool.retries + 1; attempt++) {
      const started = Date.now();
      try {
        const result = await withTimeout(
          tool.execute(parsedInput.data, ctx),
          tool.timeoutMs,
          `${name} timed out after ${tool.timeoutMs}ms`,
        );
        const parsedOutput = tool.outputSchema.safeParse(result);
        if (!parsedOutput.success) {
          throw new ToolError(
            `invalid output from ${name}: ${parsedOutput.error.message}`,
            "invalid_output",
          );
        }
        await ctx.audit?.({
          toolName: name,
          input: parsedInput.data,
          output: parsedOutput.data,
          status: "ok",
          attempt,
          durationMs: Date.now() - started,
        });
        return parsedOutput.data;
      } catch (err) {
        lastError = err as Error;
        const timedOut = /timed out/.test(lastError.message);
        await ctx.audit?.({
          toolName: name,
          input: parsedInput.data,
          status: timedOut ? "timeout" : "error",
          attempt,
          durationMs: Date.now() - started,
          error: lastError.message,
        });
        if (ctx.signal?.aborted) break;
        if (attempt <= tool.retries) {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        }
      }
    }
    throw new ToolError(`tool ${name} failed: ${lastError?.message ?? "unknown"}`, "failed");
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ToolError(message, "timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}