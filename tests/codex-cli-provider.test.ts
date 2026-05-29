import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexArgs,
  buildCodexCommandArgs,
} from "../src/api/providers/codex-cli-args.ts";

void test("buildCodexArgs 将参考图作为 Codex CLI image 附件传入", () => {
  assert.deepEqual(
    buildCodexArgs(
      "exec --skip-git-repo-check --sandbox workspace-write",
      "/tmp/workspace",
      ["/tmp/reference-1.png", "/tmp/reference-2.webp"],
    ),
    [
      "exec",
      "--cd",
      "/tmp/workspace",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--image",
      "/tmp/reference-1.png",
      "--image",
      "/tmp/reference-2.webp",
    ],
  );
});

void test("buildCodexArgs 保留用户已配置的工作目录", () => {
  assert.deepEqual(
    buildCodexArgs("exec --cd /custom/workspace", "/tmp/workspace", [
      "/tmp/reference.png",
    ]),
    ["exec", "--cd", "/custom/workspace", "--image", "/tmp/reference.png"],
  );
});

void test("buildCodexCommandArgs 使用 -- 结束图片参数再传 prompt", () => {
  assert.deepEqual(
    buildCodexCommandArgs(
      "exec --skip-git-repo-check",
      undefined,
      "画一只猫",
      ["/tmp/reference.png"],
      "/tmp/last-message.txt",
    ),
    [
      "exec",
      "--skip-git-repo-check",
      "--output-last-message",
      "/tmp/last-message.txt",
      "--image",
      "/tmp/reference.png",
      "--",
      "画一只猫",
    ],
  );
});
