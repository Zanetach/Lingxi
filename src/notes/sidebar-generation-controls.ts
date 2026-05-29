type Translator = (zh: string, en: string) => string;

export interface SidebarGenerationControlElements {
  generateBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  optimizePromptBtn: HTMLButtonElement;
  imageToImageToggleBtn: HTMLButtonElement | null;
  imageToImageUploadBtn: HTMLButtonElement | null;
  imageToImageFileInput: HTMLInputElement | null;
  insertAllBtn: HTMLButtonElement;
  retryFailedBtn: HTMLButtonElement;
  generationStatusEl: HTMLElement | null;
}

export interface SidebarGenerationControlState {
  hasRunning: boolean;
  isImageToImageEnabled: boolean;
  imageRequiredMissing: boolean;
  hasPrompt: boolean;
  readyCount: number;
  isBulkInserting: boolean;
  failedCount: number;
  pendingTaskCount: number;
  activeRequestTotal: number;
  activeConcurrencyCount: number;
  generationStartTime: number | null;
  elapsedTimer: number | null;
}

export interface SidebarGenerationControlResult {
  generationStartTime: number | null;
  elapsedTimer: number | null;
}

export function renderSidebarGenerationControls(
  elements: SidebarGenerationControlElements,
  state: SidebarGenerationControlState,
  tr: Translator,
  scheduleUpdate: () => void,
): SidebarGenerationControlResult {
  const {
    generateBtn,
    cancelBtn,
    optimizePromptBtn,
    imageToImageToggleBtn,
    imageToImageUploadBtn,
    imageToImageFileInput,
  } = elements;

  generateBtn.disabled = state.hasRunning || state.imageRequiredMissing;
  cancelBtn.disabled = !state.hasRunning;
  cancelBtn.toggleClass("is-active", state.hasRunning);
  optimizePromptBtn.disabled = state.hasRunning || !state.hasPrompt;
  if (imageToImageToggleBtn) imageToImageToggleBtn.disabled = state.hasRunning;
  if (imageToImageUploadBtn) {
    imageToImageUploadBtn.disabled =
      state.hasRunning || !state.isImageToImageEnabled;
  }
  if (imageToImageFileInput) {
    imageToImageFileInput.disabled =
      state.hasRunning || !state.isImageToImageEnabled;
  }

  renderBulkButtons(elements, state, tr);
  if (!state.hasRunning) return renderIdleState(elements, state, tr);
  return renderRunningState(elements, state, tr, scheduleUpdate);
}

function renderBulkButtons(
  elements: SidebarGenerationControlElements,
  state: SidebarGenerationControlState,
  tr: Translator,
): void {
  elements.insertAllBtn.disabled =
    state.readyCount === 0 || state.hasRunning || state.isBulkInserting;
  elements.insertAllBtn.textContent =
    state.readyCount > 0
      ? `${tr("一键插入全部", "Insert All")} (${state.readyCount})`
      : tr("一键插入全部", "Insert All");

  const hasFailed = state.failedCount > 0;
  elements.retryFailedBtn.disabled =
    !hasFailed || state.hasRunning || state.isBulkInserting;
  elements.retryFailedBtn.textContent = hasFailed
    ? `${tr("重试失败项", "Retry Failed")} (${state.failedCount})`
    : tr("重试失败项", "Retry Failed");
}

function renderIdleState(
  elements: SidebarGenerationControlElements,
  state: SidebarGenerationControlState,
  tr: Translator,
): SidebarGenerationControlResult {
  elements.generateBtn.textContent = tr("生成", "Generate");
  elements.generateBtn.removeClass("generating");
  if (state.elapsedTimer !== null) window.clearInterval(state.elapsedTimer);

  const statusEl = elements.generationStatusEl;
  if (!statusEl) return { generationStartTime: null, elapsedTimer: null };
  if (state.failedCount > 0) {
    statusEl.textContent = tr(
      `有 ${state.failedCount} 项失败，可点击重试`,
      `${state.failedCount} failed item(s). Click Retry Failed.`,
    );
  } else if (state.imageRequiredMissing) {
    statusEl.textContent = tr(
      "图生图已开启，请先上传或选择参考图",
      "Image-to-Image is on. Upload or select a reference image first.",
    );
  } else {
    statusEl.textContent = "";
  }
  statusEl.removeClass("is-running");
  statusEl.addClass("is-idle");
  return { generationStartTime: null, elapsedTimer: null };
}

function renderRunningState(
  elements: SidebarGenerationControlElements,
  state: SidebarGenerationControlState,
  tr: Translator,
  scheduleUpdate: () => void,
): SidebarGenerationControlResult {
  let generationStartTime = state.generationStartTime;
  let elapsedTimer = state.elapsedTimer;
  if (generationStartTime === null) {
    generationStartTime = Date.now();
    elapsedTimer = window.setInterval(scheduleUpdate, 1000);
  }

  const total = state.activeRequestTotal || state.pendingTaskCount;
  const finished = Math.max(0, total - state.pendingTaskCount);
  elements.generateBtn.textContent =
    `${tr("生成中", "Generating")} ${finished}/${total}`;
  elements.generateBtn.addClass("generating");

  const statusEl = elements.generationStatusEl;
  if (statusEl) {
    const running = Math.max(0, state.activeConcurrencyCount);
    const elapsed = generationStartTime
      ? Math.floor((Date.now() - generationStartTime) / 1000)
      : 0;
    const elapsedStr = elapsed > 0 ? ` · ${elapsed}${tr("秒", "s")}` : "";
    statusEl.textContent =
      `${tr("并发进行中", "Running")} ${running}` +
      tr(" 路，剩余 ", " concurrent, remaining ") +
      `${state.pendingTaskCount} / ${total}${elapsedStr}`;
    statusEl.removeClass("is-idle");
    statusEl.addClass("is-running");
  }
  return { generationStartTime, elapsedTimer };
}
