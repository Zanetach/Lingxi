import type { SidebarCopilotDomElements } from "./sidebar-copilot-dom";

export interface SidebarCopilotEventCallbacks {
  onInsertAll: () => void;
  onRetryFailed: () => void;
  onPresetChange: (selectedId: string) => void;
  onPresetManage: () => void;
  onPresetBrowser: () => void;
  onPresetDelete: () => void;
  onImageModelChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onAspectRatioChange: (value: string) => void;
  onImageCountChange: (value: string) => void;
  onGenerate: () => void;
  normalizePromptShortcut: (value: string) => string;
  onPromptInput: () => void;
  onCancel: () => void;
  onOptimizePrompt: () => void;
  onToggleImageToImage: () => void;
  onAddReference: (event: MouseEvent) => void;
  onReferenceFileChange: () => void;
  onClearReferences: () => void;
  onReferencePreviewClick: () => void;
  canAcceptReferenceImageDrop: () => boolean;
  onReferenceFileDrop: (file: File) => void;
}

export function bindSidebarCopilotEvents(
  elements: SidebarCopilotDomElements,
  callbacks: SidebarCopilotEventCallbacks,
): void {
  elements.insertAllBtn.addEventListener("click", callbacks.onInsertAll);
  elements.retryFailedBtn.addEventListener("click", callbacks.onRetryFailed);
  elements.presetSelect.addEventListener("change", () => {
    callbacks.onPresetChange(elements.presetSelect.value);
  });
  elements.presetManageBtn.addEventListener("click", callbacks.onPresetManage);
  elements.viewAllPresetsBtn.addEventListener("click", callbacks.onPresetBrowser);
  elements.presetDeleteBtn.addEventListener("click", callbacks.onPresetDelete);
  elements.imageModelSelect.addEventListener("change", () => {
    callbacks.onImageModelChange(elements.imageModelSelect.value);
  });
  elements.resolutionSelect.addEventListener("change", () => {
    callbacks.onResolutionChange(elements.resolutionSelect.value);
  });
  elements.aspectRatioSelect.addEventListener("change", () => {
    callbacks.onAspectRatioChange(elements.aspectRatioSelect.value);
  });
  elements.imageCountSelect.addEventListener("change", () => {
    callbacks.onImageCountChange(elements.imageCountSelect.value);
  });
  elements.generateBtn.addEventListener("click", callbacks.onGenerate);
  elements.inputEl.addEventListener("input", () => {
    normalizePromptInput(elements.inputEl, callbacks.normalizePromptShortcut);
    callbacks.onPromptInput();
  });
  elements.cancelBtn.addEventListener("click", callbacks.onCancel);
  elements.optimizePromptBtn.addEventListener("click", callbacks.onOptimizePrompt);
  elements.imageToImageToggleBtn.addEventListener(
    "click",
    callbacks.onToggleImageToImage,
  );
  elements.imageToImageUploadBtn.addEventListener("click", (event) => {
    callbacks.onAddReference(event);
  });
  elements.imageToImageFileInput.addEventListener(
    "change",
    callbacks.onReferenceFileChange,
  );
  elements.imageToImageClearBtn.addEventListener(
    "click",
    callbacks.onClearReferences,
  );
  elements.imageToImagePreviewWrapEl.addEventListener(
    "click",
    callbacks.onReferencePreviewClick,
  );
  bindReferenceDropEvents(elements, callbacks);
}

function normalizePromptInput(
  inputEl: HTMLTextAreaElement,
  normalize: (value: string) => string,
): void {
  const normalized = normalize(inputEl.value);
  if (normalized === inputEl.value) return;
  const cursor = inputEl.selectionStart ?? inputEl.value.length;
  inputEl.value = normalized;
  const nextCursor = Math.min(
    cursor + ("@current_note".length - 1),
    normalized.length,
  );
  inputEl.setSelectionRange(nextCursor, nextCursor);
}

function bindReferenceDropEvents(
  elements: SidebarCopilotDomElements,
  callbacks: SidebarCopilotEventCallbacks,
): void {
  const wrap = elements.imageToImagePreviewWrapEl;
  wrap.addEventListener("dragover", (event) => {
    if (!callbacks.canAcceptReferenceImageDrop()) return;
    event.preventDefault();
    wrap.addClass("is-drag-over");
  });
  wrap.addEventListener("dragleave", (event) => {
    if (!callbacks.canAcceptReferenceImageDrop()) return;
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && wrap.contains(nextTarget)) return;
    wrap.removeClass("is-drag-over");
  });
  wrap.addEventListener("drop", (event) => {
    if (!callbacks.canAcceptReferenceImageDrop()) return;
    event.preventDefault();
    wrap.removeClass("is-drag-over");
    const droppedFile = event.dataTransfer?.files?.[0];
    if (droppedFile) callbacks.onReferenceFileDrop(droppedFile);
  });
}
