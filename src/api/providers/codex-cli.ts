import { Platform, requestUrl } from "obsidian";
import type { CanvasAISettings } from "../../settings/settings";
import { assertSupportedImageBytes } from "../../utils/image-signature";
import type { ImageGenerationResult } from "../i-provider";
import type { GeminiContent } from "../types";
import { buildCodexCommandArgs } from "./codex-cli-args";

type RequireLike = (id: string) => unknown;

interface ChildProcessModule {
  spawn(
    command: string,
    args: string[],
    options: { cwd?: string; shell: false },
  ): SpawnedProcess;
}

interface SpawnedProcess {
  stdin?: { write: (chunk: string) => void; end: () => void };
  stdout?: { on: (event: "data", callback: (chunk: DataChunk) => void) => void };
  stderr?: { on: (event: "data", callback: (chunk: DataChunk) => void) => void };
  on(event: "error", callback: (error: Error) => void): void;
  on(event: "close", callback: (code: number | null) => void): void;
  kill: (signal?: string) => void;
}

interface FsModule {
  promises: {
    readFile: (path: string) => Promise<Uint8Array>;
    writeFile: (path: string, data: Uint8Array) => Promise<void>;
    mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
    rm: (
      path: string,
      options: { recursive: boolean; force: boolean },
    ) => Promise<void>;
    access: (path: string) => Promise<void>;
  };
}

interface PathModule {
  extname: (path: string) => string;
  isAbsolute: (path: string) => boolean;
  join: (...paths: string[]) => string;
  resolve: (...paths: string[]) => string;
}

interface OsModule {
  tmpdir: () => string;
}

interface DataChunk {
  toString(): string;
}

export class CodexCliProvider {
  private settings: CanvasAISettings;

  constructor(settings: CanvasAISettings) {
    this.settings = settings;
  }

  updateSettings(settings: CanvasAISettings): void {
    this.settings = settings;
  }

  getApiKey(): string {
    return this.settings.codexCommand || "codex";
  }

  async checkEnvironment(): Promise<string> {
    if (!Platform.isDesktopApp) {
      throw new Error("Codex CLI provider is only available on desktop.");
    }
    const command = (this.settings.codexCommand || "codex").trim();
    const cwd = (this.settings.codexWorkingDir || "").trim() || undefined;
    const output = await this.runCommand(command, ["--version"], cwd, 10000);
    return output.trim() || "Codex CLI is available.";
  }

  async chatCompletion(prompt: string): Promise<string> {
    return await this.runCodex(prompt);
  }

  async *streamChatCompletion(
    prompt: string | GeminiContent[],
  ): AsyncGenerator<{ content?: string; thinking?: string }, void, unknown> {
    const text =
      typeof prompt === "string" ? prompt : JSON.stringify(prompt, null, 2);
    yield { content: await this.chatCompletion(text) };
  }

  async generateImage(
    instruction: string,
    imagesWithRoles: { base64: string; mimeType: string; role: string }[],
    contextText?: string,
    aspectRatio?: string,
    resolution?: string,
    abortSignal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    const tempReferenceImages =
      await this.writeReferenceImagesToTempFiles(imagesWithRoles);
    const outputLastMessage = await this.createTempTextPath("last-message");
    const prompt = this.buildImagePrompt(
      instruction,
      imagesWithRoles,
      contextText,
      aspectRatio,
      resolution,
    );
    try {
      const output = await this.runCodex(
        prompt,
        abortSignal,
        tempReferenceImages.paths,
        outputLastMessage.path,
      );
      return await this.extractImageResult(
        await this.readOutputLastMessage(outputLastMessage.path, output),
      );
    } finally {
      await this.cleanupTempImageDir(tempReferenceImages.dir);
      await this.cleanupTempImageDir(outputLastMessage.dir);
    }
  }

  async multimodalChat(
    prompt: string,
  ): Promise<{ content: string; thinking?: string }> {
    return { content: await this.chatCompletion(prompt) };
  }

  private buildImagePrompt(
    instruction: string,
    imagesWithRoles: { base64: string; mimeType: string; role: string }[],
    contextText?: string,
    aspectRatio?: string,
    resolution?: string,
  ): string {
    const parts = [
      "You are called by the Lingxi Obsidian plugin to complete one image-generation task.",
      "Generate the requested image from the prompt.",
      "Return only one machine-readable image result: a data:image/...;base64,... URL, an absolute local image path, a file:// image URL, or a Markdown image link to a local image file.",
      "The returned result must point to a real PNG, JPEG, WebP, or GIF image with a valid image file header. Do not return placeholder bytes, random bytes, or a fake data URL.",
      "Use available local tools or scripts when needed to create the image file. Keep the implementation direct and avoid long explanations.",
      "Do not add explanation before or after the image result.",
    ];
    const cwd = (this.settings.codexWorkingDir || "").trim();
    if (cwd) {
      parts.push(
        `[Output directory]\nSave the generated image as a real image file inside this writable directory:\n${cwd}\nReturn only the absolute path to that image file.`,
      );
    }

    if (this.settings.imageSystemPrompt) {
      parts.push(`[System]\n${this.settings.imageSystemPrompt}`);
    }
    if (contextText?.trim()) {
      parts.push(`[Context]\n${contextText.trim()}`);
    }
    if (aspectRatio || resolution) {
      parts.push(
        `[Image options]\nAspect ratio: ${aspectRatio || "default"}\nResolution: ${resolution || "default"}`,
      );
    }
    if (imagesWithRoles.length > 0) {
      parts.push(
        `[Reference images]\n${imagesWithRoles.length} reference image(s) are attached to this Codex CLI run via --image. Use them as visual references for the generated image.`,
      );
    }
    parts.push(`[Instruction]\n${instruction}`);
    return parts.join("\n\n");
  }

  private async runCodex(
    prompt: string,
    abortSignal?: AbortSignal,
    imagePaths: string[] = [],
    outputLastMessagePath?: string,
  ): Promise<string> {
    if (!Platform.isDesktopApp) {
      throw new Error("Codex CLI provider is only available on desktop.");
    }

    const command = (this.settings.codexCommand || "codex").trim();
    const cwd = (this.settings.codexWorkingDir || "").trim() || undefined;
    const args = buildCodexCommandArgs(
      this.settings.codexArgs || "exec",
      cwd,
      prompt,
      imagePaths,
      outputLastMessagePath,
    );
    const timeoutMs = (this.settings.imageGenerationTimeout || 300) * 1000;

    return await this.runCommand(command, args, cwd, timeoutMs, abortSignal);
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string | undefined,
    timeoutMs: number,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const childProcess = this.requireModule<ChildProcessModule>("child_process");
    const resolvedCommand = await this.resolveCommand(command);

    return await new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      const child = childProcess.spawn(resolvedCommand, args, {
        cwd,
        shell: false,
      });
      child.stdin?.end();

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        abortSignal?.removeEventListener("abort", abortHandler);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const timeoutId = window.setTimeout(() => {
        child.kill("SIGTERM");
        fail(new Error(`Codex CLI timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      const abortHandler = () => {
        child.kill("SIGTERM");
        fail(new DOMException("Codex CLI aborted", "AbortError"));
      };

      abortSignal?.addEventListener("abort", abortHandler);
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => fail(error));
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (code === 0) {
          resolve(stdout.trim());
          return;
        }
        reject(
          new Error(
            `Codex CLI exited with code ${code ?? "unknown"}: ${stderr.trim() || stdout.trim()}`,
          ),
        );
      });
    });
  }

  private async resolveCommand(command: string): Promise<string> {
    const trimmed = command.trim() || "codex";
    if (trimmed.includes("/")) {
      return trimmed;
    }

    const candidates = [
      `/opt/homebrew/bin/${trimmed}`,
      `/usr/local/bin/${trimmed}`,
      `/usr/bin/${trimmed}`,
      `/bin/${trimmed}`,
    ];
    for (const candidate of candidates) {
      if (await this.canReadFile(candidate)) {
        return candidate;
      }
    }
    return trimmed;
  }

  private async extractImageResult(output: string): Promise<ImageGenerationResult> {
    const dataUrl = output.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
    if (dataUrl) return { imageDataUrl: this.normalizeImageDataUrl(dataUrl[0]) };

    const httpUrl = output.match(/https?:\/\/[^\s)>"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)>"']*)?/i);
    if (httpUrl) {
      return { imageDataUrl: await this.fetchImageUrlAsDataUrl(httpUrl[0]) };
    }

    const localPath = await this.findLocalImagePath(output);
    if (localPath) {
      return {
        imageDataUrl: await this.readLocalImageAsDataUrl(localPath),
        localPath,
      };
    }

    throw new Error(
      "Codex CLI did not return an image data URL, image URL, or local image path.",
    );
  }

  private async findLocalImagePath(output: string): Promise<string | null> {
    const path = this.requireModule<PathModule>("path");
    const markdownLinks = Array.from(
      output.matchAll(/!\[[^\]]*]\(([^)]+)\)/g),
      (match) => match[1],
    );
    const rawCandidates = [
      ...markdownLinks,
      ...Array.from(
        output.matchAll(/(?:file:\/\/)?(?:\/[^\s)>"']+\.(?:png|jpe?g|webp|gif))/gi),
        (match) => match[0],
      ),
    ];
    const cwd = (this.settings.codexWorkingDir || "").trim();

    for (const raw of rawCandidates) {
      const withoutFileScheme = raw.replace(/^file:\/\//, "").trim();
      const candidate = path.isAbsolute(withoutFileScheme)
        ? withoutFileScheme
        : cwd
          ? path.resolve(cwd, withoutFileScheme)
          : withoutFileScheme;
      if (await this.canReadFile(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private async canReadFile(filePath: string): Promise<boolean> {
    const fs = this.requireModule<FsModule>("fs");
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readLocalImageAsDataUrl(filePath: string): Promise<string> {
    const fs = this.requireModule<FsModule>("fs");
    const bytes = await fs.promises.readFile(filePath);
    const mimeType = assertSupportedImageBytes(bytes);
    return `data:${mimeType};base64,${this.bytesToBase64(bytes)}`;
  }

  private async writeReferenceImagesToTempFiles(
    imagesWithRoles: { base64: string; mimeType: string; role: string }[],
  ): Promise<{ dir: string | null; paths: string[] }> {
    if (imagesWithRoles.length === 0) return { dir: null, paths: [] };

    const fs = this.requireModule<FsModule>("fs");
    const os = this.requireModule<OsModule>("os");
    const path = this.requireModule<PathModule>("path");
    const dir = path.join(
      os.tmpdir(),
      `lingxi-codex-images-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
    );
    await fs.promises.mkdir(dir, { recursive: true });

    const paths: string[] = [];
    for (let index = 0; index < imagesWithRoles.length; index++) {
      const image = imagesWithRoles[index];
      const bytes = this.base64ToBytes(image.base64);
      const detectedMimeType = assertSupportedImageBytes(bytes);
      const extension = this.getImageExtension(
        detectedMimeType || image.mimeType,
      );
      const filePath = path.join(dir, `reference-${index + 1}${extension}`);
      await fs.promises.writeFile(filePath, bytes);
      paths.push(filePath);
    }
    return { dir, paths };
  }

  private async createTempTextPath(
    prefix: string,
  ): Promise<{ dir: string; path: string }> {
    const fs = this.requireModule<FsModule>("fs");
    const os = this.requireModule<OsModule>("os");
    const path = this.requireModule<PathModule>("path");
    const dir = path.join(
      os.tmpdir(),
      `lingxi-codex-${prefix}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
    );
    await fs.promises.mkdir(dir, { recursive: true });
    return { dir, path: path.join(dir, `${prefix}.txt`) };
  }

  private async readOutputLastMessage(
    filePath: string,
    fallback: string,
  ): Promise<string> {
    const fs = this.requireModule<FsModule>("fs");
    try {
      const bytes = await fs.promises.readFile(filePath);
      const text = this.bytesToUtf8(bytes).trim();
      return text || fallback;
    } catch {
      return fallback;
    }
  }

  private async cleanupTempImageDir(dir: string | null): Promise<void> {
    if (!dir) return;
    const fs = this.requireModule<FsModule>("fs");
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Lingxi: failed to clean Codex reference images", error);
    }
  }

  private getImageExtension(mimeType: string): string {
    switch (mimeType.toLowerCase()) {
      case "image/jpeg":
      case "image/jpg":
        return ".jpg";
      case "image/webp":
        return ".webp";
      case "image/gif":
        return ".gif";
      case "image/png":
      default:
        return ".png";
    }
  }

  private async fetchImageUrlAsDataUrl(url: string): Promise<string> {
    const response = await requestUrl({ url, method: "GET" });
    const bytes = new Uint8Array(response.arrayBuffer);
    const mimeType = assertSupportedImageBytes(bytes);
    return `data:${mimeType};base64,${this.bytesToBase64(bytes)}`;
  }

  private normalizeImageDataUrl(dataUrl: string): string {
    const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      throw new Error("Codex CLI returned malformed image data URL.");
    }
    const bytes = this.base64ToBytes(match[1]);
    const mimeType = assertSupportedImageBytes(bytes);
    return `data:${mimeType};base64,${match[1]}`;
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private bytesToUtf8(bytes: Uint8Array): string {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(bytes);
    }
    let text = "";
    for (let i = 0; i < bytes.length; i++) {
      text += String.fromCharCode(bytes[i]);
    }
    return decodeURIComponent(escape(text));
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private requireModule<T>(moduleName: string): T {
    const host = globalThis as typeof globalThis & { require?: RequireLike };
    const win = window as Window & { require?: RequireLike };
    const requireFn = host.require ?? win.require;
    if (!requireFn) {
      throw new Error("Node require is unavailable in this Obsidian runtime.");
    }
    return requireFn(moduleName) as T;
  }
}
