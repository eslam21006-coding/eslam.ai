export type AdminCandidate = {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
};

export type AdminRecord = {
  email: string;
  user_id: string | null;
};

export type AdminAuthorizationDependencies = {
  findByUserId(userId: string): Promise<AdminRecord | null>;
  findByEmail(email: string): Promise<AdminRecord | null>;
  bindUser(email: string, userId: string): Promise<AdminRecord | null>;
};

export type AdminAuthorization =
  | { authorized: true; userId: string; email: string }
  | { authorized: false };

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function resolveAdminAuthorization(
  candidate: AdminCandidate,
  dependencies: AdminAuthorizationDependencies,
): Promise<AdminAuthorization> {
  const boundRecord = await dependencies.findByUserId(candidate.id);
  if (boundRecord) {
    return {
      authorized: true,
      userId: candidate.id,
      email: boundRecord.email,
    };
  }

  if (!candidate.email || !candidate.emailConfirmedAt) {
    return { authorized: false };
  }

  const email = normalizeAdminEmail(candidate.email);
  const pendingRecord = await dependencies.findByEmail(email);
  if (!pendingRecord || pendingRecord.user_id) {
    return { authorized: false };
  }

  const bound = await dependencies.bindUser(email, candidate.id);
  if (!bound || bound.user_id !== candidate.id) {
    return { authorized: false };
  }

  return {
    authorized: true,
    userId: candidate.id,
    email: bound.email,
  };
}
