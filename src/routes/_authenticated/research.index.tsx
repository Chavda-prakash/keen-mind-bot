import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { ChatView } from "@/components/research/chat-view";
import { getWorkspace } from "@/lib/research.functions";

export const Route = createFileRoute("/_authenticated/research/")({
  component: NewResearch,
});

function NewResearch() {
  const fetchWorkspace = useServerFn(getWorkspace);
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace({}) });

  if (workspace.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!workspace.data) {
    return <div className="p-8 text-sm text-destructive">Could not load your workspace.</div>;
  }
  return <ChatView workspaceId={workspace.data.id} conversationId={null} initialMessages={[]} />;
}
