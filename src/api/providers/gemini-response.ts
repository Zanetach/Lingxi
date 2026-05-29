import { requestUrl } from "obsidian";
import type { GeminiPart, GeminiResponse } from "../types";
import { getErrorMessage } from "../utils";

export function extractTextAndThinkingFromResponse(
  data: GeminiResponse,
): {
  content: string;
  thinking?: string;
  thoughtSignature?: string;
} {
  const parts = getFirstCandidateParts(data);
  const thinkingParts = parts.filter((p: GeminiPart) => p.text && p.thought);
  const outputParts = parts.filter((p: GeminiPart) => p.text && !p.thought);
  const textPart =
    outputParts.length > 0
      ? outputParts[outputParts.length - 1]
      : parts.find((p: GeminiPart) => p.text);

  if (!textPart?.text) {
    throw new Error("Gemini returned no text in response");
  }

  const thinking = thinkingParts.map((p) => p.text).join("");
  const thoughtSignature = parts.find(
    (p) => p.thoughtSignature,
  )?.thoughtSignature;

  console.debug(
    `Lingxi: [gemini] Received response (thinking: ${
      thinking.length > 0 ? "yes" : "no"
    }, signature: ${thoughtSignature ? "yes" : "no"})`,
  );

  return {
    content: textPart.text,
    thinking: thinking || undefined,
    thoughtSignature,
  };
}

export function extractTextFromResponse(data: GeminiResponse): string {
  return extractTextAndThinkingFromResponse(data).content;
}

export async function parseGeminiImageResponse(
  data: GeminiResponse,
): Promise<string> {
  const parts = getFirstCandidateParts(data);
  for (const part of parts) {
    if (part.thought) continue;

    if (part.inlineData) {
      const mimeType = part.inlineData.mimeType || "image/png";
      const base64Data = part.inlineData.data;
      console.debug("Lingxi: Gemini returned base64 image, mimeType:", mimeType);
      return `data:${mimeType};base64,${base64Data}`;
    }

    if (part.file_data) {
      const url = part.file_data.file_uri;
      console.debug("Lingxi: Gemini returned URL, fetching:", url);
      return await fetchImageAsDataUrl(url);
    }
  }

  const outputParts = parts.filter((p: GeminiPart) => p.text && !p.thought);
  const textPart =
    outputParts.length > 0
      ? outputParts[outputParts.length - 1]
      : parts.find((p: GeminiPart) => p.text);
  const textContent = textPart?.text || "No image returned";
  throw new Error(`Image generation failed: ${textContent}`);
}

function getFirstCandidateParts(data: GeminiResponse): GeminiPart[] {
  const candidates = data.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error("Gemini returned no candidates");
  }

  const parts = candidates[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error("Gemini returned no parts in response");
  }
  return parts;
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  try {
    const response = await requestUrl({ url, method: "GET" });
    const arrayBuffer = response.arrayBuffer;
    const mimeType = getImageMimeType(url, response.headers["content-type"]);
    const base64Data = encodeBytesToBase64(new Uint8Array(arrayBuffer));

    console.debug(
      "Lingxi: Fetched image, mimeType:",
      mimeType,
      "size:",
      arrayBuffer.byteLength,
    );
    return `data:${mimeType};base64,${base64Data}`;
  } catch (error: unknown) {
    throw new Error(`Failed to fetch image: ${getErrorMessage(error)}`);
  }
}

function getImageMimeType(url: string, contentType?: string): string {
  if (contentType) return contentType.split(";")[0].trim();
  if (url.includes(".jpg") || url.includes(".jpeg")) return "image/jpeg";
  if (url.includes(".webp")) return "image/webp";
  return "image/png";
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...chunk));
  }
  return window.btoa(parts.join(""));
}
