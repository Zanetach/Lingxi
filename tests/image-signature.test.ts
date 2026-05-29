import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSupportedImageBytes,
  detectImageMimeType,
} from "../src/utils/image-signature.ts";

void test("detectImageMimeType 识别常见图片文件头", () => {
  assert.equal(
    detectImageMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/png",
  );
  assert.equal(detectImageMimeType(new Uint8Array([0xff, 0xd8, 0xff])), "image/jpeg");
  assert.equal(
    detectImageMimeType(
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    ),
    "image/webp",
  );
  assert.equal(
    detectImageMimeType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    "image/gif",
  );
});

void test("assertSupportedImageBytes 拒绝伪装成图片的随机字节", () => {
  assert.throws(
    () => assertSupportedImageBytes(new Uint8Array([0x3c, 0xb0, 0x02, 0x10, 0x73, 0x8b, 0x0c, 0x44])),
    /不是有效图片/,
  );
});
