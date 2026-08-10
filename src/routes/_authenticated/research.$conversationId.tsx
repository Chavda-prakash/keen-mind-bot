import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { ChatView, type ChatMessageView } from "@/components/research/chat-view";
import type { ResearchMode } from "@/core/agent/types";
import { getConversation, getWorkspace } from "@/lib/research.functions";

export const Route = createFileRoute("/_authenticated/research/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const fetchWorkspace = useServerFn(getWorkspace);
  const fetchConversation = useServerFn(getConversation);

  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace({}) });
  const conversation = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConversation({ data: { conversationId } }),
  });

  if (workspace.isLoading || conversation.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!workspace.data || !conversation.data) {
    return <div className="p-8 text-sm text-muted-foreground">This research thread no longer exists.</div>;
  }

  return (
    <ChatView
      key={conversationId}
      workspaceId={workspace.data.id}
      conversationId={conversationId}
      initialMode={(conversation.data.conversation.mode as ResearchMode) ?? "quick"}
      initialMessages={conversation.data.messages as unknown as ChatMessageView[]}
    />
  );
}
