import {
  ItemView,
  WorkspaceLeaf,
} from "obsidian";
import type CanvasAIPlugin from "../../main";
import { isZhLocale, t } from "../../lang/helpers";
import { LINGXI_ICON_ID } from "../icons/lingxi-icon";
import type { NotesSelectionContext } from "./notes-selection-handler";
import { SidebarCandidateManager } from "./sidebar-candidate-manager";
import { SidebarGenerationQueue } from "./sidebar-generation-queue";
import { renderSidebarGenerationControls } from "./sidebar-generation-controls";
import { SidebarGenerationActions } from "./sidebar-generation-actions";
import {
  createSidebarCopilotDom,
  type SidebarCopilotDomElements,
} from "./sidebar-copilot-dom";
import { bindSidebarCopilotEvents } from "./sidebar-copilot-events";
import { SidebarPromptTools } from "./sidebar-prompt-tools";
import { SidebarPresetController } from "./sidebar-preset-controller";
import { SidebarReferenceController } from "./sidebar-reference-controller";
import { SidebarImageOptionsController } from "./sidebar-image-options-controller";
import { registerSidebarWorkspaceEvents } from "./sidebar-workspace-events";

export const VIEW_TYPE_SIDEBAR_COPILOT = "canvas-ai-sidebar-copilot";

export class SideBarCoPilotView extends ItemView {
  private plugin: CanvasAIPlugin;
  private promptTools: SidebarPromptTools;

  private messagesContainer: HTMLElement;
  private domElements!: SidebarCopilotDomElements;
  private candidateContainer: HTMLElement;
  private candidateListEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private optimizePromptBtn: HTMLButtonElement;
  private generateBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private retryFailedBtn: HTMLButtonElement;
  private insertAllBtn: HTMLButtonElement;
  private generationStatusEl: HTMLElement;
  private imageToImageToggleBtn: HTMLButtonElement;
  private imageToImageStateEl: HTMLElement;
  private imageToImagePanelEl: HTMLElement;
  private imageToImageUploadBtn: HTMLButtonElement;
  private imageToImageClearBtn: HTMLButtonElement;
  private imageToImageFileInput: HTMLInputElement;
  private imageToImagePreviewWrapEl: HTMLElement;
  private imageToImagePreviewEl: HTMLImageElement;
  private imageToImageFileNameEl: HTMLElement;

  private imageModelSelect: HTMLSelectElement;
  private resolutionSelect: HTMLSelectElement;
  private aspectRatioSelect: HTMLSelectElement;
  private imageCountSelect: HTMLSelectElement;

  private presetSelect: HTMLSelectElement;
  private presetManageBtn: HTMLButtonElement;
  private presetDeleteBtn: HTMLButtonElement;
  private viewAllPresetsBtn: HTMLButtonElement;
  private recentPresetsListEl: HTMLElement;

  private promptSaveTimer: number | null = null;
  private generationStartTime: number | null = null;
  private elapsedTimer: number | null = null;

  private capturedContext: NotesSelectionContext | null = null;

  private candidateManager!: SidebarCandidateManager;
  private generationQueue!: SidebarGenerationQueue;
  private generationActions!: SidebarGenerationActions;
  private presetController!: SidebarPresetController;
  private referenceController!: SidebarReferenceController;
  private imageOptionsController!: SidebarImageOptionsController;

  private tr(zh: string, en: string): string {
    return isZhLocale() ? zh : en;
  }

  constructor(leaf: WorkspaceLeaf, plugin: CanvasAIPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.promptTools = new SidebarPromptTools(
      (zh, en) => this.tr(zh, en),
      () => {
        const file =
          this.app.workspace.getActiveFile() || this.capturedContext?.file;
        return file?.extension === "md" ? file.basename || "" : "";
      },
      () =>
        this.aspectRatioSelect?.value ||
        this.plugin.settings.defaultAspectRatio ||
        "16:9",
    );
  }

  getViewType(): string { return VIEW_TYPE_SIDEBAR_COPILOT; }

  getDisplayText(): string { return "Lingxi"; }

  getIcon(): string { return LINGXI_ICON_ID; }

  async onOpen(): Promise<void> {
    await Promise.resolve();
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("sidebar-copilot-container");

    this.createDOM(container);
    this.presetController = new SidebarPresetController(
      this.app,
      this.plugin,
      {
        presetSelect: this.presetSelect,
        presetDeleteBtn: this.presetDeleteBtn,
        recentPresetsListEl: this.recentPresetsListEl,
      },
      (zh, en) => this.tr(zh, en),
      {
        setInputPromptValue: (prompt, options) =>
          this.setInputPromptValue(prompt, options),
        queuePersistSidebarState: () => this.queuePersistSidebarState(),
        updateGenerateButtonState: () => this.updateGenerateButtonState(),
        getPromptValue: () => this.inputEl?.value || "",
      },
    );
    this.referenceController = new SidebarReferenceController(
      this.app,
      {
        imageToImageToggleBtn: this.imageToImageToggleBtn,
        imageToImageStateEl: this.imageToImageStateEl,
        imageToImagePanelEl: this.imageToImagePanelEl,
        imageToImageUploadBtn: this.imageToImageUploadBtn,
        imageToImageClearBtn: this.imageToImageClearBtn,
        imageToImageFileInput: this.imageToImageFileInput,
        imageToImagePreviewWrapEl: this.imageToImagePreviewWrapEl,
        imageToImagePreviewEl: this.imageToImagePreviewEl,
        imageToImageFileNameEl: this.imageToImageFileNameEl,
      },
      (zh, en) => this.tr(zh, en),
      {
        getCapturedContext: () => this.capturedContext,
        syncReferenceImageNameToPrompt: (fileName) =>
          this.syncReferenceImageNameToPrompt(fileName),
        updateGenerateButtonState: () => this.updateGenerateButtonState(),
      },
    );
    this.imageOptionsController = new SidebarImageOptionsController(
      this.plugin,
      {
        imageModelSelect: this.imageModelSelect,
        resolutionSelect: this.resolutionSelect,
        aspectRatioSelect: this.aspectRatioSelect,
        imageCountSelect: this.imageCountSelect,
      },
      (zh, en) => this.tr(zh, en),
    );

    this.candidateManager = new SidebarCandidateManager(
      this.plugin,
      this.candidateListEl,
      this.messagesContainer,
      (zh, en) => this.tr(zh, en),
      {
        updateButtons: () => this.updateGenerateButtonState(),
        getPendingTaskCount: () => this.generationQueue?.pendingTaskCount ?? 0,
        onRegenerateCandidate: (id) =>
          this.generationActions.handleRegenerateCandidate(id),
      },
    );

    this.generationQueue = new SidebarGenerationQueue(
      this.plugin,
      this.candidateManager,
      (zh, en) => this.tr(zh, en),
      {
        addMessage: (role, content) =>
          this.candidateManager.addMessage(role, content),
        updateButtons: () => this.updateGenerateButtonState(),
      },
    );
    this.generationActions = new SidebarGenerationActions(
      this.app,
      this.plugin,
      this.promptTools,
      this.referenceController,
      this.candidateManager,
      this.generationQueue,
      {
        inputEl: this.inputEl,
        imageCountSelect: this.imageCountSelect,
      },
      (zh, en) => this.tr(zh, en),
      {
        getCapturedContext: () => this.capturedContext,
        setCapturedContext: (context) => {
          this.capturedContext = context;
        },
        autoResizePromptInput: () => this.autoResizePromptInput(),
        queuePersistSidebarState: () => this.queuePersistSidebarState(),
        updateGenerateButtonState: () => this.updateGenerateButtonState(),
      },
    );

    this.setupEvents();
    this.candidateManager.renderCandidateList();
    this.candidateManager.startCandidateCleanupTimer();
    this.initFromSettings();
    registerSidebarWorkspaceEvents(
      this,
      this.plugin,
      (zh, en) => this.tr(zh, en),
      {
        clearCapturedContext: () => {
          this.capturedContext = null;
        },
        getPromptValue: () => this.inputEl?.value || "",
        setInputPromptValue: (prompt, options) =>
          this.setInputPromptValue(prompt, options),
      },
    );
  }

  async onClose(): Promise<void> {
    await Promise.resolve();
    this.candidateManager?.stopCleanupTimer();
    this.candidateManager?.stopRenderRaf();
    if (this.promptSaveTimer !== null) {
      window.clearTimeout(this.promptSaveTimer);
      this.promptSaveTimer = null;
    }
    if (this.elapsedTimer !== null) {
      window.clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    this.referenceController?.destroy();
  }

  public refreshFromSettings(): void {
    this.initFromSettings();
  }

  public onSelectionCleared(): void {
    this.capturedContext = null;
    this.updateGenerateButtonState();
  }

  private createDOM(container: HTMLElement): void {
    const elements = createSidebarCopilotDom(
      container,
      (zh, en) => this.tr(zh, en),
      t("Image"),
    );
    this.domElements = elements;
    this.candidateContainer = elements.candidateContainer;
    this.candidateListEl = elements.candidateListEl;
    this.insertAllBtn = elements.insertAllBtn;
    this.retryFailedBtn = elements.retryFailedBtn;
    this.presetSelect = elements.presetSelect;
    this.presetManageBtn = elements.presetManageBtn;
    this.presetDeleteBtn = elements.presetDeleteBtn;
    this.viewAllPresetsBtn = elements.viewAllPresetsBtn;
    this.recentPresetsListEl = elements.recentPresetsListEl;
    this.imageModelSelect = elements.imageModelSelect;
    this.resolutionSelect = elements.resolutionSelect;
    this.aspectRatioSelect = elements.aspectRatioSelect;
    this.imageCountSelect = elements.imageCountSelect;
    this.generationStatusEl = elements.generationStatusEl;
    this.imageToImageToggleBtn = elements.imageToImageToggleBtn;
    this.imageToImageStateEl = elements.imageToImageStateEl;
    this.imageToImagePanelEl = elements.imageToImagePanelEl;
    this.imageToImageUploadBtn = elements.imageToImageUploadBtn;
    this.imageToImagePreviewWrapEl = elements.imageToImagePreviewWrapEl;
    this.imageToImagePreviewEl = elements.imageToImagePreviewEl;
    this.imageToImageFileNameEl = elements.imageToImageFileNameEl;
    this.imageToImageClearBtn = elements.imageToImageClearBtn;
    this.imageToImageFileInput = elements.imageToImageFileInput;
    this.inputEl = elements.inputEl;
    this.optimizePromptBtn = elements.optimizePromptBtn;
    this.generateBtn = elements.generateBtn;
    this.cancelBtn = elements.cancelBtn;
    this.messagesContainer = elements.messagesContainer;
    this.registerDomEvent(this.candidateListEl, "scroll", () => {
      this.candidateManager?.scheduleCandidateListRender();
    });
    this.registerDomEvent(window, "resize", () => {
      this.candidateManager?.scheduleCandidateListRender();
    });
  }

  private setupEvents(): void {
    bindSidebarCopilotEvents(this.domElements, {
      onInsertAll: () => void this.candidateManager.handleInsertAllCandidates(),
      onRetryFailed: () => this.generationQueue.retryFailedTasks(),
      onPresetChange: (selectedId) =>
        this.presetController.handleSelectChange(selectedId),
      onPresetManage: () => this.presetController.openEditor(),
      onPresetBrowser: () => this.presetController.openBrowser(),
      onPresetDelete: () => void this.presetController.deleteSelectedPreset(),
      onImageModelChange: (value) =>
        this.imageOptionsController.handleImageModelChange(value),
      onResolutionChange: (value) =>
        this.imageOptionsController.handleResolutionChange(value),
      onAspectRatioChange: (value) =>
        this.imageOptionsController.handleAspectRatioChange(value),
      onImageCountChange: (value) =>
        this.imageOptionsController.handleImageCountChange(value),
      onGenerate: () => void this.generationActions.handleGenerate(),
      normalizePromptShortcut: (value) =>
        this.promptTools.normalizeCurrentNoteShortcut(value),
      onPromptInput: () => this.handlePromptInput(),
      onCancel: () => this.generationQueue.cancelCurrentGeneration(),
      onOptimizePrompt: () => this.generationActions.handleOptimizePrompt(),
      onToggleImageToImage: () =>
        this.referenceController.setMode(!this.referenceController.isEnabled()),
      onAddReference: (event) =>
        this.referenceController.openAddReferenceMenu(event),
      onReferenceFileChange: () =>
        void this.referenceController.handleReferenceImageFileChange(),
      onClearReferences: () => this.referenceController.clearAllReferenceImages(),
      onReferencePreviewClick: () =>
        this.referenceController.handleReferencePreviewClick(),
      canAcceptReferenceImageDrop: () =>
        this.referenceController.canAcceptReferenceImageDrop(),
      onReferenceFileDrop: (file) =>
        void this.referenceController.processReferenceImageFile(file),
    });
  }

  private handlePromptInput(): void {
    this.enforceReferenceLineLock();
    this.autoResizePromptInput();
    this.queuePersistSidebarState();
    this.updateGenerateButtonState();
  }

  private initFromSettings(): void {
    this.presetController.initFromSettings();
    this.imageOptionsController.initFromSettings();
    this.setInputPromptValue(this.plugin.settings.sidebarDraftPrompt || "", {
      persist: false,
      updateState: false,
    });
    this.referenceController.updateControls();
    this.updateGenerateButtonState();
  }

  private autoResizePromptInput(): void {
    if (!this.inputEl) return;

    const minHeight = 68;
    const maxHeight = 160;

    this.inputEl.setCssProps({ height: "auto" });
    const next = Math.min(
      maxHeight,
      Math.max(minHeight, this.inputEl.scrollHeight),
    );
    this.inputEl.setCssProps({
      height: String(next) + "px",
      "overflow-y": this.inputEl.scrollHeight > maxHeight ? "auto" : "hidden",
    });
  }

  private syncReferenceImageNameToPrompt(fileName: string | null): void {
    if (!this.inputEl) return;
    const current = this.inputEl.value || "";
    const next = this.promptTools.composePromptWithReferenceLine(current, fileName);
    if (next === current) return;
    this.inputEl.value = next;
    this.autoResizePromptInput();
    this.queuePersistSidebarState();
    this.updateGenerateButtonState();
  }

  private enforceReferenceLineLock(): void {
    if (!this.inputEl || !this.referenceController.isEnabled()) return;
    const primaryRefName = this.referenceController.getPrimaryReferenceName();
    if (!primaryRefName) return;

    const current = this.inputEl.value || "";
    const next = this.promptTools.composePromptWithReferenceLine(current, primaryRefName);
    if (next === current) return;

    const cursor = this.inputEl.selectionStart ?? current.length;
    const firstLineBreak = current.indexOf("\n");
    const bodyOffset =
      firstLineBreak >= 0 && current.startsWith(this.promptTools.referencePromptPrefix)
        ? Math.max(0, cursor - (firstLineBreak + 1))
        : cursor;

    this.inputEl.value = next;

    const nextBody = this.promptTools.composePromptWithReferenceLine(next, null);
    const safeBodyOffset = Math.min(bodyOffset, nextBody.length);
    const prefixLen = `${this.promptTools.referencePromptPrefix}${primaryRefName}`.length;
    const nextCursor =
      safeBodyOffset > 0 ? prefixLen + 1 + safeBodyOffset : prefixLen;
    this.inputEl.setSelectionRange(nextCursor, nextCursor);
  }

  private queuePersistSidebarState(): void {
    if (this.promptSaveTimer !== null) {
      window.clearTimeout(this.promptSaveTimer);
    }

    this.promptSaveTimer = window.setTimeout(() => {
      this.plugin.settings.sidebarDraftPrompt = this.inputEl?.value || "";
      this.plugin.settings.sidebarSelectedPresetId =
        this.presetSelect?.value || "";
      void this.plugin.saveSettings();
      this.promptSaveTimer = null;
    }, 220);
  }

  private setInputPromptValue(
    rawPrompt: string,
    options?: { persist?: boolean; updateState?: boolean },
  ): void {
    if (!this.inputEl) return;
    const persist = options?.persist ?? true;
    const updateState = options?.updateState ?? true;

    let next = this.promptTools.normalizeCurrentNoteShortcut(rawPrompt || "");
    if (this.referenceController.isEnabled()) {
      const refName = this.referenceController.getPrimaryReferenceName();
      if (refName) {
        next = this.promptTools.composePromptWithReferenceLine(next, refName);
      }
    }

    this.inputEl.value = next;
    this.autoResizePromptInput();
    if (persist) this.queuePersistSidebarState();
    if (updateState) this.updateGenerateButtonState();
  }

  private updateGenerateButtonState(): void {
    if (!this.generateBtn) return;

    const hasRunning = this.generationQueue?.pendingTaskCount > 0;
    const explicitRefCount =
      this.referenceController.getExplicitReferenceCount();
    const imageRequiredMissing =
      this.referenceController.isEnabled() && explicitRefCount === 0;
    const hasPrompt = Boolean(this.inputEl?.value.trim());
    const readyCount = this.candidateManager?.getReadyCandidateCount() ?? 0;
    const isBulkInserting = this.candidateManager?.isBulkInserting ?? false;
    const failedCount = this.candidateManager?.failedTasks.length ?? 0;
    const result = renderSidebarGenerationControls(
      {
        generateBtn: this.generateBtn,
        cancelBtn: this.cancelBtn,
        optimizePromptBtn: this.optimizePromptBtn,
        imageToImageToggleBtn: this.imageToImageToggleBtn || null,
        imageToImageUploadBtn: this.imageToImageUploadBtn || null,
        imageToImageFileInput: this.imageToImageFileInput || null,
        insertAllBtn: this.insertAllBtn,
        retryFailedBtn: this.retryFailedBtn,
        generationStatusEl: this.generationStatusEl || null,
      },
      {
        hasRunning,
        isImageToImageEnabled: this.referenceController.isEnabled(),
        imageRequiredMissing,
        hasPrompt,
        readyCount,
        isBulkInserting,
        failedCount,
        pendingTaskCount: this.generationQueue?.pendingTaskCount ?? 0,
        activeRequestTotal: this.generationQueue?.activeRequestTotal ?? 0,
        activeConcurrencyCount:
          this.generationQueue?.activeConcurrencyCount ?? 0,
        generationStartTime: this.generationStartTime,
        elapsedTimer: this.elapsedTimer,
      },
      (zh, en) => this.tr(zh, en),
      () => this.updateGenerateButtonState(),
    );
    this.generationStartTime = result.generationStartTime;
    this.elapsedTimer = result.elapsedTimer;
  }

}
