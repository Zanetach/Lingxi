import type { App, TFile } from "obsidian";

export function isImageFile(file: File): boolean {
  if (file.type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name || "");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("empty_file"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error || new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function encodeBytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(""));
}

export function extractImageRefsFromContent(content: string): string[] {
  const refs: string[] = [];
  const obsidianRegex = /!\[\[([^\]]+)\]\]/gi;
  const markdownRegex =
    /!\[[^\]]*]\(([^)]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)[^)]*)\)/gi;
  let match: RegExpExecArray | null = null;
  while ((match = obsidianRegex.exec(content)) !== null) {
    const cleaned = normalizeObsidianImageTarget(match[1] || "");
    if (cleaned) refs.push(cleaned);
  }
  while ((match = markdownRegex.exec(content)) !== null) {
    const cleaned = normalizeMarkdownImageTarget(match[1] || "");
    if (cleaned) refs.push(cleaned);
  }
  return refs;
}

export function normalizeObsidianImageTarget(rawTarget: string): string {
  const trimmed = (rawTarget || "").trim();
  if (!trimmed) return "";
  const withoutAlias = trimmed.split("|")[0]?.trim() || "";
  const withoutAnchor = withoutAlias.split("#")[0]?.trim() || "";
  if (!/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(withoutAnchor)) return "";
  return withoutAnchor;
}

export function normalizeMarkdownImageTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<") && trimmed.includes(">")) {
    return trimmed.slice(1, trimmed.indexOf(">")).trim();
  }
  return trimmed.split(/\s+/)[0] || "";
}

export function resolveCandidateImagePath(
  app: App,
  notePath: string,
  rawPath: string,
): string | null {
  const normalized = rawPath.replace(/^\/+/, "").trim();

  const resolvedByLink = app.metadataCache.getFirstLinkpathDest(
    normalized,
    notePath,
  );
  if (isResolvedFile(resolvedByLink)) {
    return resolvedByLink.path;
  }

  if (app.vault.getAbstractFileByPath(normalized)) {
    return normalized;
  }
  const dir = notePath.includes("/")
    ? notePath.slice(0, notePath.lastIndexOf("/"))
    : "";
  const relative = dir ? `${dir}/${normalized}` : normalized;
  if (app.vault.getAbstractFileByPath(relative)) {
    return relative;
  }
  return null;
}

export function getMimeTypeByFileName(fileName: string): string {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

function isResolvedFile(value: unknown): value is TFile {
  return Boolean(
    value &&
      typeof value === "object" &&
      "path" in value &&
      typeof (value as { path?: unknown }).path === "string",
  );
}
