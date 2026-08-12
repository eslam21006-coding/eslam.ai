export const TEACH_ESLAM_SEMANTIC_LAYERS = [
  { value: "identity", label: "Identity", hint: "من هو إسلام، معتقداته، موقفه ورؤيته." },
  { value: "brain", label: "Brain", hint: "المبادئ، القواعد، الأطر ومنطق التشخيص." },
  { value: "cases", label: "Cases", hint: "حالات وأمثلة وقرارات سابقة للاسترشاد بها." },
  { value: "voice", label: "Voice", hint: "طريقة الكلام، المصطلحات وأسلوب الشرح." },
] as const;

export const TEACH_ESLAM_ITEM_TYPES = [
  { value: "identity_fact", label: "Identity fact" },
  { value: "principle", label: "Principle" },
  { value: "diagnostic_rule", label: "Diagnostic rule" },
  { value: "framework", label: "Framework" },
  { value: "hard_rule", label: "Hard rule" },
  { value: "example", label: "Example" },
  { value: "correction", label: "Correction" },
  { value: "contraindication", label: "Contraindication" },
  { value: "voice_rule", label: "Voice rule" },
] as const;

export const TEACH_ESLAM_LIMITS = {
  title: 200,
  content: 16_000,
  summary: 1_200,
  changeNote: 1_000,
  topics: 12,
  topic: 120,
  priorityMin: 0,
  priorityMax: 1_000,
} as const;

export type TeachEslamValues = {
  title: string;
  content: string;
  summary: string;
  topics: string;
  change_note: string;
  semantic_layer: string;
  item_type: string;
  priority: string;
};

export const EMPTY_TEACH_ESLAM_VALUES: TeachEslamValues = {
  title: "",
  content: "",
  summary: "",
  topics: "",
  change_note: "",
  semantic_layer: "brain",
  item_type: "principle",
  priority: "100",
};

export type TeachEslamActionState = {
  error: "invalid_input" | "save_failed" | null;
  revision: number;
  values: TeachEslamValues;
  created: { itemId: string; title: string; versionNumber: 1 } | null;
};

export const INITIAL_TEACH_ESLAM_ACTION_STATE: TeachEslamActionState = {
  error: null,
  revision: 0,
  values: EMPTY_TEACH_ESLAM_VALUES,
  created: null,
};

export type ValidTeachEslamDraft = {
  title: string;
  content: string;
  summary: string | null;
  topics: string[];
  change_note: string | null;
  semantic_layer: (typeof TEACH_ESLAM_SEMANTIC_LAYERS)[number]["value"];
  item_type: (typeof TEACH_ESLAM_ITEM_TYPES)[number]["value"];
  priority: number;
};

export function normalizeTeachEslamTopics(input: string) {
  const unique = new Map<string, string>();

  for (const rawTopic of input.split(/[\n,،]+/u)) {
    const topic = rawTopic.trim();
    if (!topic) continue;
    const key = topic.toLocaleLowerCase("en-US");
    if (!unique.has(key)) unique.set(key, topic);
  }

  return Array.from(unique.values());
}

export function validateTeachEslamDraft(values: TeachEslamValues):
  | { ok: true; draft: ValidTeachEslamDraft }
  | { ok: false } {
  const title = values.title.trim();
  const content = values.content.trim();
  const summary = values.summary.trim();
  const changeNote = values.change_note.trim();
  const topics = normalizeTeachEslamTopics(values.topics);
  const priorityText = values.priority.trim();

  const semanticLayer = TEACH_ESLAM_SEMANTIC_LAYERS.find(
    (option) => option.value === values.semantic_layer,
  )?.value;
  const itemType = TEACH_ESLAM_ITEM_TYPES.find(
    (option) => option.value === values.item_type,
  )?.value;

  if (!semanticLayer || !itemType) return { ok: false };
  if (!title || title.length > TEACH_ESLAM_LIMITS.title) return { ok: false };
  if (!content || content.length > TEACH_ESLAM_LIMITS.content) return { ok: false };
  if (summary.length > TEACH_ESLAM_LIMITS.summary) return { ok: false };
  if (changeNote.length > TEACH_ESLAM_LIMITS.changeNote) return { ok: false };
  if (topics.length > TEACH_ESLAM_LIMITS.topics) return { ok: false };
  if (topics.some((topic) => topic.length > TEACH_ESLAM_LIMITS.topic)) return { ok: false };
  if (!priorityText) return { ok: false };

  const priority = Number(priorityText);
  if (!Number.isInteger(priority)) return { ok: false };
  if (priority < TEACH_ESLAM_LIMITS.priorityMin || priority > TEACH_ESLAM_LIMITS.priorityMax) {
    return { ok: false };
  }

  return {
    ok: true,
    draft: {
      title,
      content,
      summary: summary || null,
      topics,
      change_note: changeNote || null,
      semantic_layer: semanticLayer,
      item_type: itemType,
      priority,
    },
  };
}
