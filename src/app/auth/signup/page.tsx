import { AuthCard } from "@/features/auth/auth-card";
import { redirectAuthenticatedUser } from "@/lib/auth/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  await redirectAuthenticatedUser();
  const params = await searchParams;
  const error = first(params.error);

  let message: string | null = null;
  if (error === "invalid_input") message = "استخدم بريداً إلكترونياً صحيحاً وكلمة مرور من 8 أحرف على الأقل.";
  if (error === "signup_failed") message = "تعذر إنشاء الحساب. حاول مرة أخرى.";

  return <AuthCard mode="signup" message={message} />;
}
