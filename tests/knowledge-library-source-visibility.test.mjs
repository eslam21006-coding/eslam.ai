import assert from "node:assert/strict";
import test from "node:test";

import { buildBasicEslamResponseRequest } from "../src/features/conversations/assistant-request.ts";
import { readSource } from "./helpers/source.mjs";

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
  assert.match(admin.instructions, /Use retrieved Knowledge invisibly by default/);
  assert.match(
    admin.instructions,
    /Unless the Admin's current request explicitly asks for citations, references, sources, provenance, or which Knowledge files support the answer/,
  );
  assert.match(
    admin.instructions,
    /do not mention the Knowledge Library, files, filenames, file titles, sources, references, citations, provenance, provider metadata, or that file_search was used in any form/,
  );
  assert.match(
    admin.instructions,
    /Do not add phrases such as 'from the Knowledge Library', 'from a library file', 'according to a file'/,
  );
  assert.match(
    admin.instructions,
    /Only when the Admin explicitly asks for citations, references, sources, provenance, or which Knowledge files support the answer/,
  );
  assert.doesNotMatch(admin.instructions, /source identities even if the user asks for them/);
});

test("both streaming and fallback chat resolve Admin status and pass the same attribution policy", () => {
  const route = readSource("src/app/api/chat/stream/route.ts");
  const actions = readSource("src/features/conversations/actions.ts");
  const assistant = readSource("src/features/conversations/assistant.ts");

  for (const source of [route, actions]) {
    assert.match(source, /import \{ isAdmin \} from "@\/lib\/auth\/admin"/);
    assert.match(
      source,
      /knowledgeSourceAttributionAllowed[\s\S]{0,220}?isAdmin\(\)/,
      "Admin status must be resolved into the Knowledge attribution flag nearby",
    );
  }

  assert.match(
    route,
    /streamBasicEslamReply\([\s\S]{0,500}?knowledgeVectorStoreId,[\s\S]{0,160}?knowledgeSourceAttributionAllowed/,
    "streaming chat must pass Knowledge store and attribution policy in the same reply call",
  );
  assert.match(
    actions,
    /generateBasicEslamReply\([\s\S]{0,500}?knowledgeVectorStoreId,[\s\S]{0,160}?knowledgeSourceAttributionAllowed/,
    "fallback chat must pass Knowledge store and attribution policy in the same reply call",
  );
  assert.match(
    assistant,
    /buildBasicEslamResponseRequest\([\s\S]{0,500}?knowledgeSourceAttributionAllowed/,
    "blocking OpenAI request construction must receive the attribution policy",
  );
  assert.match(
    assistant,
    /buildBasicEslamStreamingResponseRequest\([\s\S]{0,500}?knowledgeSourceAttributionAllowed/,
    "streaming OpenAI request construction must receive the attribution policy",
  );
});
