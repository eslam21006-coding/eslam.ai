import { AuthCard } from "@/features/auth/auth-card";
import { redirectAuthenticatedUser } from "@/lib/auth/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  await redirectAuthenticatedUser();
  const params = await searchParams;
  const error = first(params.error);
  const status = first(params.status);

  let message: string | null = null;
  if (error === "invalid_input") message = "راجع البريد الإلكتروني وكلمة المرور.";
  if (error === "invalid_credentials") message = "بيانات الدخول غير صحيحة.";
  if (status === "check_email") message = "تحقق من بريدك الإلكتروني لتأكيد الحساب ثم سجل الدخول.";
  if (status === "signed_out") message = "تم تسجيل الخروج.";

  return <AuthCard mode="login" message={message} />;
}
