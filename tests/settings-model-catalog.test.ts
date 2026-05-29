import test from "node:test";
import assert from "node:assert/strict";
import {
  getGeminiHardcodedModels,
  getImageModels,
  getOpenAIHardcodedModels,
  getTextModels,
} from "../src/settings/settings-model-catalog.ts";

void test("Gemini 图片模型只返回 image 专用模型", () => {
  const imageModels = getImageModels("gemini", getGeminiHardcodedModels());

  assert.ok(imageModels.length >= 2);
  assert.ok(imageModels.every((model) => model.id.includes("image")));
});

void test("OpenAI 文本和图片模型按能力分开", () => {
  const models = getOpenAIHardcodedModels();

  assert.deepEqual(
    getImageModels("openai", models).map((model) => model.id),
    ["gpt-image-2"],
  );
  assert.ok(getTextModels("openai", models, true).some((m) => m.id === "gpt-5"));
});

void test("Codex provider 不显示远程模型下拉", () => {
  const models = getGeminiHardcodedModels();

  assert.deepEqual(getTextModels("codex", models, true), []);
  assert.deepEqual(getImageModels("codex", models), []);
});
