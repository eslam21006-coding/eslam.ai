export const MAX_ESLAM_BRAIN_QUERY_ITEMS = 64;
export const MAX_ESLAM_BRAIN_CONTEXT_CHARS = 28_000;
export const MAX_ESLAM_BRAIN_CONTENT_CHARS = 4_000;
export const MAX_ESLAM_BRAIN_SUMMARY_CHARS = 800;
export const MAX_ESLAM_BRAIN_TOPIC_CHARS = 120;
export const MAX_ESLAM_BRAIN_TOPICS = 12;

export const ESLAM_BRAIN_SEMANTIC_LAYERS = [
  "identity",
  "brain",
  "cases",
  "voice",
] as const;
const ITEM_TYPES = [
  "identity_fact",
  "principle",
  "diagnostic_rule",
  "framework",
  "hard_rule",
  "example",
  "correction",
  "contraindication",
  "voice_rule",
] as const;

type SemanticLayer = (typeof ESLAM_BRAIN_SEMANTIC_LAYERS)[number];
type ItemType = (typeof ITEM_TYPES)[number];

export type PublishedBrainVersionRow = {
  version_number: number;
  title: string;
  content: string;
  summary: string | null;
  topics: string[];
};

export type PublishedBrainQueryRow = {
  id: string;
  semantic_layer: string;
  item_type: string;
  priority: number;
  published_version_number: number | null;
  published_version: PublishedBrainVersionRow | PublishedBrainVersionRow[] | null;
};

export type PublishedEslamBrainItem = {
  id: string;
  semanticLayer: SemanticLayer;
  itemType: ItemType;
  priority: number;
  title: string;
  content: string;
  summary: string | null;
  topics: string[];
};

const semanticLayers = new Set<string>(ESLAM_BRAIN_SEMANTIC_LAYERS);
const itemTypes = new Set<string>(ITEM_TYPES);
const layerRank = new Map<string, number>(
  ESLAM_BRAIN_SEMANTIC_LAYERS.map((layer, index) => [layer, index]),
);

function boundedText(value: string, maxChars: number) {
  const normalized = value.trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function normalizeTopics(topics: string[]) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const topic of topics) {
    if (normalized.length >= MAX_ESLAM_BRAIN_TOPICS) break;
    if (typeof topic !== "string") continue;

    const value = boundedText(topic, MAX_ESLAM_BRAIN_TOPIC_CHARS);
    if (!value || seen.has(value)) continue;

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function relationVersions(
  relation: PublishedBrainQueryRow["published_version"],
): PublishedBrainVersionRow[] {
  if (!relation) return [];
  return Array.isArray(relation) ? relation : [relation];
}

export function resolvePublishedEslamBrainItems(
  rows: PublishedBrainQueryRow[],
): PublishedEslamBrainItem[] {
  const resolved: PublishedEslamBrainItem[] = [];

  for (const row of rows) {
    if (
      !row.id ||
      !semanticLayers.has(row.semantic_layer) ||
      !itemTypes.has(row.item_type) ||
      !Number.isInteger(row.priority) ||
      row.priority < 0 ||
      row.priority > 1000 ||
      !Number.isInteger(row.published_version_number)
    ) {
      continue;
    }

    const version = relationVersions(row.published_version).find(
      (candidate) => candidate.version_number === row.published_version_number,
    );
    if (!version || typeof version.title !== "string" || typeof version.content !== "string") {
      continue;
    }

    const title = boundedText(version.title, 200);
    const content = boundedText(version.content, MAX_ESLAM_BRAIN_CONTENT_CHARS);
    if (!title || !content) continue;

    const summary =
      typeof version.summary === "string" && version.summary.trim()
        ? boundedText(version.summary, MAX_ESLAM_BRAIN_SUMMARY_CHARS)
        : null;

    resolved.push({
      id: row.id,
      semanticLayer: row.semantic_layer as SemanticLayer,
      itemType: row.item_type as ItemType,
      priority: row.priority,
      title,
      content,
      summary,
      topics: Array.isArray(version.topics) ? normalizeTopics(version.topics) : [],
    });
  }

  return resolved;
}

function comparePublishedItems(a: PublishedEslamBrainItem, b: PublishedEslamBrainItem) {
  return (
    a.priority - b.priority ||
    (layerRank.get(a.semanticLayer) ?? 99) - (layerRank.get(b.semanticLayer) ?? 99) ||
    a.id.localeCompare(b.id)
  );
}

function serializeForModel(item: PublishedEslamBrainItem) {
  return {
    layer: item.semanticLayer,
    type: item.itemType,
    priority: item.priority,
    title: item.title,
    content: item.content,
    ...(item.summary ? { summary: item.summary } : {}),
    ...(item.topics.length > 0 ? { topics: item.topics } : {}),
  };
}

export function buildBoundedEslamBrainContext(items: PublishedEslamBrainItem[]) {
  const selected = [...items]
    .sort(comparePublishedItems)
    .slice(0, MAX_ESLAM_BRAIN_QUERY_ITEMS)
    .map(serializeForModel);

  while (selected.length > 0) {
    const serialized = JSON.stringify(selected);
    if (serialized.length <= MAX_ESLAM_BRAIN_CONTEXT_CHARS) {
      return serialized;
    }
    selected.pop();
  }

  return null;
}
