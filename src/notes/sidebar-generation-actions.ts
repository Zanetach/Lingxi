import { App, Notice } from "obsidian";
import type CanvasAIPlugin from "../../main";
import { t } from "../../lang/helpers";
import type { NotesSelectionContext } from "./notes-selection-handler";
import type { SidebarInputImage } from "./sidebar-candidate-types";
import { SidebarCandidateManager } from "./sidebar-candidate-manager";
import { formatImageError } from "./sidebar-generation-errors";
import { SidebarGenerationQueue } from "./sidebar-generation-queue";
import { SidebarPromptTools } from "./sidebar-prompt-tools";
import type { CurrentNoteInjectionResult } from "./sidebar-prompt-tools";
import { SidebarReferenceController } from "./sidebar-reference-controller";

type Translator = (zh: string, en: string) => string;

export interface SidebarGenerationActionElements {
  inputEl: HTMLTextAreaElement;
  imageCountSelect: HTMLSelectElement;
}

export interface SidebarGenerationActionCallbacks {
  getCapturedContext: () => NotesSelectionContext | null;
  setCapturedContext: (context: NotesSelectionContext | null) => void;
  autoResizePromptInput: () => void;
  queuePersistSidebarState: () => void;
  updateGenerateButtonState: () => void;
}

export class SidebarGenerationActions {
  private app: App;
  private plugin: CanvasAIPlugin;
  private promptTools: SidebarPromptTools;
  private referenceController: SidebarReferenceController;
  private candidateManager: SidebarCandidateManager;
  private generationQueue: SidebarGenerationQueue;
  private elements: SidebarGenerationActionElements;
  private tr: Translator;
  private callbacks: SidebarGenerationActionCallbacks;

  constructor(
    app: App,
    plugin: CanvasAIPlugin,
    promptTools: SidebarPromptTools,
    referenceController: SidebarReferenceController,
    candidateManager: SidebarCandidateManager,
    generationQueue: SidebarGenerationQueue,
    elements: SidebarGenerationActionElements,
    tr: Translator,
    callbacks: SidebarGenerationActionCallbacks,
  ) {
    this.app = app;
    this.plugin = plugin;
    this.promptTools = promptTools;
    this.referenceController = referenceController;
    this.candidateManager = candidateManager;
    this.generationQueue = generationQueue;
    this.elements = elements;
    this.tr = tr;
    this.callbacks = callbacks;
  }

  public async handleGenerate(): Promise<void> {
    if (this.generationQueue.pendingTaskCount > 0) return;
    const notesHandler = this.plugin.getNotesHandler();
    if (!notesHandler) {
      new Notice(this.tr("笔记处理器不可用", "Notes handler unavailable"));
      return;
    }

    let promptDraft = this.normalizePromptDraft(this.elements.inputEl.value || "");
    const refreshedContext = notesHandler.captureSelectionForSidebar();
    if (refreshedContext) this.callbacks.setCapturedContext(refreshedContext);

    const inputImages = this.referenceController.getInputImages();
    if (this.referenceController.isEnabled() && inputImages.length === 0) {
      new Notice(
        this.tr(
          "请先上传或选择参考图，再进行图生图",
          "Please upload or select a reference image before Image-to-Image.",
        ),
      );
      return;
    }
    promptDraft = this.ensureReferenceLine(promptDraft);

    const injected = await this.injectPromptOrNotice(promptDraft);
    if (injected === null) return;
    const rawPrompt = injected.trim();
    const context = this.callbacks.getCapturedContext();
    if (!rawPrompt && !context?.selectedText?.trim()) {
      new Notice(t("Enter instructions"));
      return;
    }

    const requestCount = this.getRequestCount();
    if (this.tryStartPptTasks(rawPrompt, context, requestCount, inputImages)) {
      return;
    }

    const prompt =
      this.referenceController.isEnabled() && inputImages.length > 0
        ? this.promptTools.buildStrictImg2ImgPrompt(rawPrompt)
        : rawPrompt;
    this.candidateManager.failedTasks = [];
    this.generationQueue.startGenerationBatch(
      prompt,
      context,
      requestCount,
      inputImages,
    );
  }

  public handleOptimizePrompt(): void {
    const current = this.elements.inputEl.value || "";
    const lines = current.split("\n");
    const hasRefLine =
      lines.length > 0 &&
      lines[0].trimStart().startsWith(this.promptTools.referencePromptPrefix);
    const body = (hasRefLine ? lines.slice(1) : lines).join("\n").trim();
    if (!body) {
      new Notice(
        this.tr(
          "请先输入需要优化的提示词",
          "Please enter a prompt to optimize",
        ),
      );
      return;
    }

    if (this.promptTools.isPptRequest(body)) {
      this.applyOptimizedPptPrompt(body);
      return;
    }
    this.applyOptimizedImagePrompt(body);
  }

  public async handleRegenerateCandidate(candidateId: string): Promise<void> {
    const notesHandler = this.plugin.getNotesHandler();
    if (!notesHandler) return;
    const candidateIndex = this.candidateManager.imageCandidates.findIndex(
      (candidate) => candidate.taskId === candidateId,
    );
    if (candidateIndex < 0) return;
    const candidate = this.candidateManager.imageCandidates[candidateIndex];
    if (candidate.status === "discarded") return;
    if (!(candidate.status === "ready" || candidate.status === "inserted")) {
      new Notice(
        this.tr(
          "请等待图片生成完成后再重生",
          "Please wait until image generation completes",
        ),
      );
      return;
    }

    const shouldDeleteSource = candidate.status !== "inserted";
    const oldFilePath = candidate.filePath;
    const { sessionId, sequence } = this.allocateRegenerationSlot();
    this.candidateManager.imageCandidates[candidateIndex] = {
      ...candidate,
      taskId: `pending-${sessionId}-${sequence}`,
      fileName: this.tr("生成中...", "Generating..."),
      filePath: "",
      createdAt: Date.now(),
      imageDataUrl: "",
      status: "pending",
      sessionId,
      sequence,
    };
    this.candidateManager.renderCandidateList();
    this.callbacks.updateGenerateButtonState();

    if (shouldDeleteSource && oldFilePath) {
      await notesHandler
        .removeCandidateImageFile(oldFilePath)
        .catch(() => undefined);
    }
    void this.generationQueue
      .runOneGeneration(
        sessionId,
        candidate.sourcePrompt,
        candidate.sourceContext as NotesSelectionContext | null,
        sequence,
        candidate.sourceInputImages,
      )
      .finally(() => {
        this.generationQueue.activeConcurrencyCount = Math.max(
          0,
          this.generationQueue.activeConcurrencyCount - 1,
        );
        this.callbacks.updateGenerateButtonState();
      });
    new Notice(this.tr("已开始重生该图片", "Regeneration started"));
  }

  private normalizePromptDraft(promptDraft: string): string {
    const normalized = this.promptTools.normalizeCurrentNoteShortcut(promptDraft);
    if (normalized !== promptDraft) {
      this.elements.inputEl.value = normalized;
      this.callbacks.autoResizePromptInput();
      this.callbacks.queuePersistSidebarState();
      return normalized;
    }
    return promptDraft;
  }

  private ensureReferenceLine(promptDraft: string): string {
    const primaryRefName = this.referenceController.getPrimaryReferenceName();
    if (!this.referenceController.isEnabled() || !primaryRefName) {
      return promptDraft;
    }
    const normalized = this.promptTools.composePromptWithReferenceLine(
      promptDraft,
      primaryRefName,
    );
    if (normalized !== promptDraft) {
      this.elements.inputEl.value = normalized;
      this.callbacks.autoResizePromptInput();
      this.callbacks.queuePersistSidebarState();
      return normalized;
    }
    return promptDraft;
  }

  private async injectPromptOrNotice(prompt: string): Promise<string | null> {
    try {
      const result = await this.injectCurrentNoteContentIntoPrompt(
        prompt,
        this.callbacks.getCapturedContext(),
      );
      if (result.replaced) {
        new Notice(
          this.tr(
            "已自动读取当前笔记内容并注入生成上下文",
            "Current note content has been injected into generation context",
          ),
        );
      }
      return result.prompt;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : formatImageError(error, this.tr);
      new Notice(msg);
      return null;
    }
  }

  private async injectCurrentNoteContentIntoPrompt(
    prompt: string,
    context: NotesSelectionContext | null,
  ): Promise<CurrentNoteInjectionResult> {
    if (!this.promptTools.hasCurrentNotePlaceholder(prompt)) {
      return { prompt, replaced: false };
    }
    const noteFile = context?.file || this.app.workspace.getActiveFile();
    if (!noteFile || noteFile.extension !== "md") {
      throw new Error(
        this.tr(
          "使用 @current_note 需要先打开一个 Markdown 笔记",
          "Using @current_note requires an active Markdown note",
        ),
      );
    }
    const raw = await this.app.vault.read(noteFile);
    const summary = this.promptTools.summarizeNoteForPrompt(raw);
    if (!summary) {
      throw new Error(
        this.tr(
          "当前笔记内容为空，无法从 @current_note 注入上下文",
          "Current note is empty, unable to inject context from @current_note",
        ),
      );
    }
    return this.promptTools.injectCurrentNoteSummary(
      prompt,
      { basename: noteFile.basename, path: noteFile.path },
      summary,
    );
  }

  private getRequestCount(): number {
    const selectedCount = Number.parseInt(
      this.elements.imageCountSelect.value,
      10,
    );
    return Number.isFinite(selectedCount) &&
      selectedCount >= 1 &&
      selectedCount <= 9
      ? selectedCount
      : Math.min(9, Math.max(1, this.plugin.settings.defaultImageCount || 4));
  }

  private tryStartPptTasks(
    rawPrompt: string,
    context: NotesSelectionContext | null,
    requestCount: number,
    inputImages: SidebarInputImage[],
  ): boolean {
    if (
      !rawPrompt.includes(this.promptTools.pptAutoMarker) &&
      !rawPrompt.includes(this.promptTools.pptAutoLegacyMarker)
    ) {
      return false;
    }
    const pageCount = this.promptTools.extractPptPageCountFromPrompt(rawPrompt);
    const tasks = this.promptTools.buildPptAutoGenerationTasks(
      rawPrompt,
      context,
      pageCount,
      requestCount,
      inputImages,
    );
    if (tasks.length === 0) {
      new Notice(
        this.tr(
          "PPT 自动拆页任务为空，请检查提示词",
          "PPT auto-split tasks are empty. Please check the prompt.",
        ),
      );
      return true;
    }
    new Notice(
      this.tr(
        `已按 ${pageCount} 页拆解；每页 ${requestCount} 张候选，共 ${tasks.length} 个任务`,
        `Split into ${pageCount} pages; ${requestCount} candidate(s) per page, ${tasks.length} tasks in total`,
      ),
    );
    this.candidateManager.failedTasks = [];
    this.generationQueue.startGenerationTasks(tasks);
    return true;
  }

  private applyOptimizedPptPrompt(body: string): void {
    const primaryRefName = this.referenceController.getPrimaryReferenceName();
    const optimizedPpt = this.promptTools.buildOptimizedPptPrompt(body);
    this.elements.inputEl.value =
      this.referenceController.isEnabled() && primaryRefName
        ? this.promptTools.composePromptWithReferenceLine(
            optimizedPpt,
            primaryRefName,
          )
        : optimizedPpt;
    new Notice(
      this.tr(
        "已生成 PPT 自动拆页提示词（生成时按页拆解）",
        "Generated PPT auto-split prompt (generation will split by pages)",
      ),
    );
    this.afterPromptMutation();
  }

  private applyOptimizedImagePrompt(body: string): void {
    const primaryRefName = this.referenceController.getPrimaryReferenceName();
    if (this.referenceController.isEnabled() && primaryRefName) {
      const optimized = this.promptTools.buildOptimizedImg2ImgPrompt(body);
      const refLine = `${this.promptTools.referencePromptPrefix}${primaryRefName}`;
      this.elements.inputEl.value = `${refLine}\n${optimized}`;
      new Notice(
        this.tr(
          "已生成保真优先的图生图提示词",
          "Generated an Image-to-Image prompt optimized for fidelity",
        ),
      );
    } else {
      this.elements.inputEl.value =
        this.promptTools.buildOptimizedTextToImagePrompt(body);
      new Notice(
        this.tr(
          "已生成结构化文生图提示词",
          "Generated a structured Text-to-Image prompt",
        ),
      );
    }
    this.afterPromptMutation();
  }

  private afterPromptMutation(): void {
    this.callbacks.autoResizePromptInput();
    this.callbacks.queuePersistSidebarState();
    this.callbacks.updateGenerateButtonState();
  }

  private allocateRegenerationSlot(): { sessionId: number; sequence: number } {
    let sessionId: number;
    let sequence: number;
    if (this.generationQueue.pendingTaskCount > 0) {
      sessionId = this.generationQueue.currentSessionId;
      sequence = Math.max(1, this.generationQueue.activeRequestTotal + 1);
      this.generationQueue.activeRequestTotal += 1;
    } else {
      this.generationQueue.currentSessionId += 1;
      sessionId = this.generationQueue.currentSessionId;
      sequence = 1;
      this.generationQueue.activeRequestTotal = 1;
    }
    this.generationQueue.pendingTaskCount += 1;
    this.generationQueue.activeConcurrencyCount += 1;
    return { sessionId, sequence };
  }
}
