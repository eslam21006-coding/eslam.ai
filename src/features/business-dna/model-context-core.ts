export const MAX_BUSINESS_DNA_VALUE_CHARS = 600;
export const MAX_BUSINESS_DNA_CONTEXT_CHARS = 16_000;

function boundBusinessDnaValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_BUSINESS_DNA_VALUE_CHARS) return trimmed;

  return `${trimmed.slice(0, MAX_BUSINESS_DNA_VALUE_CHARS - 1)}…`;
}

export function buildBoundedBusinessDnaContext(
  entries: ReadonlyArray<readonly [string, string]>,
) {
  const context: Record<string, string> = {};

  for (const [field, rawValue] of entries) {
    const value = boundBusinessDnaValue(rawValue);
    if (!value) continue;

    context[field] = value;
    if (JSON.stringify(context).length > MAX_BUSINESS_DNA_CONTEXT_CHARS) {
      delete context[field];
      break;
    }
  }

  const serialized = JSON.stringify(context);
  return serialized === "{}" ? null : serialized;
}
