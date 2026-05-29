import test from "node:test";
import assert from "node:assert/strict";
import { SidebarPromptTools } from "../src/notes/sidebar-prompt-tools.ts";

const tr = (zh: string): string => zh;

function createTools(): SidebarPromptTools {
  return new SidebarPromptTools(
    tr,
    () => "欢迎",
    () => "16:9",
  );
}

void test("normalizeCurrentNoteShortcut 将单独 @ 转成当前笔记占位符", () => {
  const tools = createTools();

  assert.equal(
    tools.normalizeCurrentNoteShortcut("画一张 @ 的封面"),
    "画一张 @current_note(欢迎) 的封面",
  );
});

void test("extractPptPageCountFromPrompt 识别中文页数", () => {
  const tools = createTools();

  assert.equal(tools.extractPptPageCountFromPrompt("基于当前笔记做 6 页 PPT"), 6);
});

void test("buildPptAutoGenerationTasks 按页数和候选数拆任务", () => {
  const tools = createTools();
  const tasks = tools.buildPptAutoGenerationTasks(
    [
      "[PPT_AUTO]",
      "第 1 页: 开场",
      "第 2 页: 总结",
    ].join("\n"),
    null,
    2,
    2,
  );

  assert.equal(tasks.length, 4);
  assert.equal(tasks[0].sequence, 1);
  assert.match(tasks[0].prompt, /页码: 1\/2/);
  assert.match(tasks[0].prompt, /页面标题: 开场/);
  assert.match(tasks[3].prompt, /同页候选: 2\/2/);
});
