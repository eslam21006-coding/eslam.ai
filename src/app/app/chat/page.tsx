import { ConversationChat } from "@/features/conversations/conversation-chat";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ChatPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = first(params.error);
  const recoveryMessage =
    error === "logout_failed"
      ? "تعذر تسجيل الخروج الآن. حاول مرة أخرى."
      : error === "profile_init_failed"
        ? "تعذر تجهيز حسابك بالكامل. حاول تسجيل الخروج ثم تسجيل الدخول مرة أخرى."
        : null;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-4 sm:px-6 lg:min-h-screen lg:px-8">
      <header className="flex min-h-20 items-center border-b border-[var(--border)] py-4">
        <div>
          <p className="text-xs font-medium text-[var(--foreground-subtle)]">محادثة جديدة</p>
          <h1 className="mt-1 text-lg font-semibold sm:text-xl">اتكلم مع إسلام</h1>
        </div>
      </header>

      {recoveryMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
        >
          {recoveryMessage}
        </p>
      ) : null}

      <ConversationChat initialMessages={[]} showEmptyState />
    </div>
  );
}
