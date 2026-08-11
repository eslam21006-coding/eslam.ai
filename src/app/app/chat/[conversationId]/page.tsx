import { notFound } from "next/navigation";

import { ConversationChat } from "@/features/conversations/conversation-chat";
import { loadConversation } from "@/features/conversations/data";
import { requireAuthenticatedUser } from "@/lib/auth/session";

type PageParams = Promise<{ conversationId: string }>;
type PageSearchParams = Promise<{ error?: string | string[] }>;

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const [{ conversationId }, query] = await Promise.all([params, searchParams]);
  const userId = await requireAuthenticatedUser();
  const thread = await loadConversation(userId, conversationId);

  if (!thread) notFound();

  const responseFailed =
    query.error === "response_failed" ||
    (Array.isArray(query.error) && query.error.includes("response_failed"));

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-4 sm:px-6 lg:min-h-screen lg:px-8">
      <header className="flex min-h-20 items-center border-b border-[var(--border)] py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--foreground-subtle)]">محادثة محفوظة</p>
          <h1 className="mt-1 truncate text-lg font-semibold sm:text-xl">{thread.conversation.title}</h1>
        </div>
      </header>

      {responseFailed ? (
        <p
          role="alert"
          className="mx-auto mt-5 w-full max-w-3xl rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-6 text-[var(--foreground-muted)]"
        >
          رسالتك محفوظة، لكن تعذر إنشاء رد من إسلام الآن. لا تحتاج لإرسال الرسالة نفسها مرة أخرى.
        </p>
      ) : null}

      <ConversationChat
        conversationId={conversationId}
        initialMessages={thread.messages}
        clearResponseErrorOnSuccess={responseFailed}
      />
    </div>
  );
}
