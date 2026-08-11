import { notFound } from "next/navigation";

import { ConversationComposer } from "@/features/conversations/conversation-composer";
import { loadConversation } from "@/features/conversations/data";
import { requireAuthenticatedUser } from "@/lib/auth/session";

type PageParams = Promise<{ conversationId: string }>;

export default async function ConversationPage({ params }: { params: PageParams }) {
  const { conversationId } = await params;
  const userId = await requireAuthenticatedUser();
  const thread = await loadConversation(userId, conversationId);

  if (!thread) notFound();

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-4 sm:px-6 lg:min-h-screen lg:px-8">
      <header className="flex min-h-20 items-center border-b border-[var(--border)] py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--foreground-subtle)]">محادثة محفوظة</p>
          <h1 className="mt-1 truncate text-lg font-semibold sm:text-xl">{thread.conversation.title}</h1>
        </div>
      </header>

      <section aria-label="المحادثة" className="flex flex-1 flex-col justify-end py-8 sm:py-12">
        <div className="mx-auto grid w-full max-w-3xl gap-6">
          {thread.messages.map((message) => {
            const isUser = message.role === "user";
            const authorLabel = isUser ? "أنت:" : message.role === "assistant" ? "إسلام:" : "النظام:";
            return (
              <article
                key={message.id}
                className={isUser ? "mr-auto max-w-[88%] sm:max-w-[75%]" : "max-w-[92%] sm:max-w-[82%]"}
              >
                <span className="sr-only">{authorLabel}</span>
                <div
                  className={
                    isUser
                      ? "rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3.5"
                      : "px-1 py-1"
                  }
                >
                  <p className="text-mixed whitespace-pre-wrap text-sm leading-7 sm:text-[0.95rem]">
                    {message.content}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="sticky bottom-0 pb-4 pt-2 sm:pb-6">
        <ConversationComposer conversationId={conversationId} />
      </footer>
    </div>
  );
}
