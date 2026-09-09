import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Compass, FileText, LogOut, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { deleteConversation, listConversations } from "@/lib/research.functions";

export const Route = createFileRoute("/_authenticated/research")({
  component: ResearchLayout,
});

function ResearchLayout() {
  const list = useServerFn(listConversations);
  const remove = useServerFn(deleteConversation);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { conversationId?: string };

  const conversations = useQuery({ queryKey: ["conversations"], queryFn: () => list({}) });
  const removeMutation = useMutation({
    mutationFn: (conversationId: string) => remove({ data: { conversationId } }),
    onSuccess: async (_r, conversationId) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (params.conversationId === conversationId) navigate({ to: "/research" });
    },
  });

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Compass className="h-4 w-4" />
          </span>
          <span className="font-semibold tracking-tight">CIEL</span>
        </div>
        <div className="px-3">
          <Link
            to="/research"
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New research
          </Link>
          <Link
            to="/knowledge"
            className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <FileText className="h-4 w-4" /> Knowledge files
          </Link>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-1 pb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </p>
          <ul className="space-y-0.5">
            {(conversations.data ?? []).map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <Link
                  to="/research/$conversationId"
                  params={{ conversationId: c.id }}
                  className="flex-1 truncate rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  activeProps={{ className: "bg-sidebar-accent text-foreground" }}
                >
                  {c.title}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMutation.mutate(c.id)}
                  className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Delete ${c.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            await queryClient.cancelQueries();
            queryClient.clear();
            await supabase.auth.signOut();
            await navigate({ to: "/auth", replace: true });
          }}
          className="h-auto justify-start rounded-none border-t border-border px-4 py-3 text-sm text-muted-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
