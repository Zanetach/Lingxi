import test from "node:test";
import assert from "node:assert/strict";
import {
  formatImageError,
  isRetryableImageErrorCode,
  normalizeImageError,
} from "../src/notes/sidebar-generation-errors.ts";

const tr = (zh: string): string => zh;

void test("normalizeImageError 识别超时并允许重试", () => {
  const error = normalizeImageError(new Error("request timed out"), tr);

  assert.equal(error.code, "超时");
  assert.equal(isRetryableImageErrorCode(error.code), true);
  assert.match(error.message, /请求超时/);
});

void test("normalizeImageError 识别鉴权失败并禁止重试", () => {
  const error = normalizeImageError(new Error("401 unauthorized api key"), tr);

  assert.equal(error.code, "鉴权失败");
  assert.equal(isRetryableImageErrorCode(error.code), false);
  assert.match(error.suggestion, /API Key/);
});

void test("formatImageError 输出稳定错误码和建议", () => {
  const message = formatImageError(new Error("service unavailable"), tr);

  assert.match(message, /^错误码\[服务异常\]/);
  assert.match(message, /建议：/);
});

void test("formatImageError 识别 Provider 返回的伪图片", () => {
  const message = formatImageError(
    new Error("生成结果不是有效图片：未识别到 PNG、JPEG、WebP 或 GIF 文件头"),
    tr,
  );

  assert.match(message, /^错误码\[无效图片\]/);
  assert.match(message, /没有返回真实图片/);
});
