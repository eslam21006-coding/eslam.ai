import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildBasicEslamResponseRequest } from "../src/features/conversations/assistant-request.ts";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Knowledge retrieval is silent for normal users and source attribution is admin-gated", () => {
  const messages = [{ role: "user", content: "What is the Blue Falcon marker?" }];

  const normalUser = buildBasicEslamResponseRequest(
    messages,
    "gpt-test",
    null,
    null,
    "vs_test",
    false,
  );
  assert.match(normalUser.instructions, /Use retrieved Knowledge silently as supporting reference material/);
  assert.match(
    normalUser.instructions,
    /Do not mention the Knowledge Library, filenames, file titles, source names, provider metadata, or that file_search was used/,
  );
  assert.match(
    normalUser.instructions,
    /Do not expose or enumerate Knowledge Library source identities even if the user asks for them/,
  );

  const admin = buildBasicEslamResponseRequest(
    messages,
    "gpt-test",
    null,
    null,
    "vs_test",
    true,
  );
  assert.match(admin.instructions, /Use retrieved Knowledge silently by default/);
  assert.match(
    admin.instructions,
    /Only when the Admin explicitly asks for citations, references, sources, or which Knowledge files support the answer/,
  );
  assert.doesNotMatch(admin.instructions, /source identities even if the user asks for them/);
});

test("both streaming and fallback chat resolve Admin status and pass the same attribution policy", () => {
  const route = readSource("src/app/api/chat/stream/route.ts");
  const actions = readSource("src/features/conversations/actions.ts");
  const assistant = readSource("src/features/conversations/assistant.ts");

  for (const source of [route, actions]) {
    assert.match(source, /import \{ isAdmin \} from "@\/lib\/auth\/admin"/);
    assert.match(source, /knowledgeSourceAttributionAllowed[\s\S]*isAdmin\(\)/);
  }

  assert.match(
    route,
    /streamBasicEslamReply\([\s\S]*knowledgeVectorStoreId,[\s\S]*knowledgeSourceAttributionAllowed/,
  );
  assert.match(
    actions,
    /generateBasicEslamReply\([\s\S]*knowledgeVectorStoreId,[\s\S]*knowledgeSourceAttributionAllowed/,
  );
  assert.match(
    assistant,
    /buildBasicEslamResponseRequest\([\s\S]*knowledgeSourceAttributionAllowed/,
  );
  assert.match(
    assistant,
    /buildBasicEslamStreamingResponseRequest\([\s\S]*knowledgeSourceAttributionAllowed/,
  );
});
