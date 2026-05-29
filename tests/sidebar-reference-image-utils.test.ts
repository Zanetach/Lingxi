import test from "node:test";
import assert from "node:assert/strict";
import {
  extractImageRefsFromContent,
  getMimeTypeByFileName,
  normalizeMarkdownImageTarget,
  normalizeObsidianImageTarget,
} from "../src/notes/sidebar-reference-image-utils.ts";

void test("normalizeObsidianImageTarget 清理 alias 和 anchor", () => {
  assert.equal(
    normalizeObsidianImageTarget("Assets/AI/card.png#section|封面"),
    "Assets/AI/card.png",
  );
  assert.equal(normalizeObsidianImageTarget("普通笔记.md"), "");
});

void test("normalizeMarkdownImageTarget 支持带 title 的 markdown 图片", () => {
  assert.equal(
    normalizeMarkdownImageTarget("<Assets/AI/card.png> \"title\""),
    "Assets/AI/card.png",
  );
  assert.equal(
    normalizeMarkdownImageTarget("Assets/AI/photo.webp \"title\""),
    "Assets/AI/photo.webp",
  );
});

void test("extractImageRefsFromContent 同时提取 Obsidian 和 Markdown 图片", () => {
  const refs = extractImageRefsFromContent(
    [
      "![[Assets/AI/a.png|封面]]",
      "![b](Assets/AI/b.webp \"title\")",
      "![[不是图片]]",
    ].join("\n"),
  );

  assert.deepEqual(refs, ["Assets/AI/a.png", "Assets/AI/b.webp"]);
});

void test("getMimeTypeByFileName 根据扩展名推断图片 MIME", () => {
  assert.equal(getMimeTypeByFileName("a.jpg"), "image/jpeg");
  assert.equal(getMimeTypeByFileName("a.svg"), "image/svg+xml");
  assert.equal(getMimeTypeByFileName("unknown"), "image/png");
});
