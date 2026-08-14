export type EslamEntryDestination = "/auth/login" | "/admin" | "/app";

/** Pure role-routing contract shared by the root entry point and regression tests. */
export function resolveEslamEntryDestination(
  userId: string | null,
  admin: boolean,
): EslamEntryDestination {
  if (!userId) return "/auth/login";
  return admin ? "/admin" : "/app";
}
