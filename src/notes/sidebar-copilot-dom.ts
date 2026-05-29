import { setIcon } from "obsidian";

type Translator = (zh: string, en: string) => string;

export interface SidebarCopilotDomElements {
  candidateContainer: HTMLElement;
  candidateListEl: HTMLElement;
  insertAllBtn: HTMLButtonElement;
  retryFailedBtn: HTMLButtonElement;
  presetSelect: HTMLSelectElement;
  presetManageBtn: HTMLButtonElement;
  presetDeleteBtn: HTMLButtonElement;
  viewAllPresetsBtn: HTMLButtonElement;
  recentPresetsListEl: HTMLElement;
  imageModelSelect: HTMLSelectElement;
  resolutionSelect: HTMLSelectElement;
  aspectRatioSelect: HTMLSelectElement;
  imageCountSelect: HTMLSelectElement;
  generationStatusEl: HTMLElement;
  imageToImageToggleBtn: HTMLButtonElement;
  imageToImageStateEl: HTMLElement;
  imageToImagePanelEl: HTMLElement;
  imageToImageUploadBtn: HTMLButtonElement;
  imageToImagePreviewWrapEl: HTMLElement;
  imageToImagePreviewEl: HTMLImageElement;
  imageToImageFileNameEl: HTMLElement;
  imageToImageClearBtn: HTMLButtonElement;
  imageToImageFileInput: HTMLInputElement;
  inputEl: HTMLTextAreaElement;
  optimizePromptBtn: HTMLButtonElement;
  generateBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  messagesContainer: HTMLElement;
}

export function createSidebarCopilotDom(
  container: HTMLElement,
  tr: Translator,
  _imageTitle: string,
): SidebarCopilotDomElements {
  const candidateContainer = container.createDiv("sidebar-image-candidates");
  const candidateHeader = candidateContainer.createDiv(
    "sidebar-image-candidates-header",
  );
  candidateHeader.createDiv({
    cls: "sidebar-image-candidates-title",
    text: tr("生成候选图", "Generated Candidates"),
  });
  const insertAllBtn = candidateHeader.createEl("button", {
    cls: "sidebar-insert-all-btn",
    text: tr("一键插入全部", "Insert All"),
  });
  const retryFailedBtn = candidateHeader.createEl("button", {
    cls: "sidebar-retry-failed-btn",
    text: tr("重试失败项", "Retry Failed"),
  });
  const candidateListEl = candidateContainer.createDiv(
    "sidebar-image-candidates-list",
  );

  const studio = container.createDiv(
    "canvas-ai-palette-footer sidebar-studio-layout",
  );
  const promptElements = createPromptSection(studio, tr);
  const parameterElements = createParameterSection(studio, tr);
  const actionElements = createActionSection(studio, tr);
  const presetElements = createPresetSection(studio, tr);

  return {
    candidateContainer,
    candidateListEl,
    insertAllBtn,
    retryFailedBtn,
    ...presetElements,
    ...parameterElements,
    ...promptElements,
    ...actionElements,
    messagesContainer: container.createDiv(
      "sidebar-image-log sidebar-image-log-hidden",
    ),
  };
}

function createPresetSection(parent: HTMLElement, tr: Translator) {
  const presetSection = parent.createDiv("sidebar-preset-section");
  presetSection.createDiv({
    cls: "sidebar-section-title",
    text: tr("预设管理", "Preset Management"),
  });
  presetSection.createDiv({
    cls: "sidebar-section-subtitle",
    text: tr("支持新增、编辑、删除预设", "Add, edit, and delete presets"),
  });
  const presetControls = presetSection.createDiv("sidebar-preset-controls");
  const presetSelect = presetControls.createEl("select", {
    cls: "canvas-ai-preset-select",
  });
  const presetActions = presetControls.createDiv("sidebar-preset-actions");
  const presetManageBtn = presetActions.createEl("button", {
    cls: "canvas-ai-preset-manage-btn",
    text: tr("新增 / 编辑", "Add / Edit"),
  });
  const presetDeleteBtn = presetActions.createEl("button", {
    cls: "canvas-ai-preset-delete-btn",
    text: tr("删除预设", "Delete Preset"),
  });
  const recentWrap = presetSection.createDiv("sidebar-recent-presets");
  const recentHeader = recentWrap.createDiv("sidebar-recent-presets-header");
  recentHeader.createDiv({
    cls: "sidebar-recent-presets-title",
    text: tr("最近预设", "Recent Presets"),
  });
  const viewAllPresetsBtn = recentHeader.createEl("button", {
    cls: "sidebar-view-all-presets-btn",
    text: tr("查看更多", "View All"),
  });
  const recentPresetsListEl = recentWrap.createDiv(
    "sidebar-recent-presets-list",
  );
  return {
    presetSelect,
    presetManageBtn,
    presetDeleteBtn,
    viewAllPresetsBtn,
    recentPresetsListEl,
  };
}

function createParameterSection(parent: HTMLElement, tr: Translator) {
  const paramsSection = parent.createDiv("sidebar-params-section");
  const optionsRow = paramsSection.createDiv("canvas-ai-image-options");
  const imageModelSelect = createSelectGroup(optionsRow, tr("模型", "Model"), {
    cls: "canvas-ai-image-model-select",
  });
  const resolutionSelect = createSelectGroup(
    optionsRow,
    tr("分辨率", "Resolution"),
  );
  ["1K", "2K", "4K"].forEach((value) => {
    resolutionSelect.createEl("option", { value, text: value });
  });
  const aspectRatioSelect = createSelectGroup(
    optionsRow,
    tr("长宽比", "Aspect Ratio"),
  );
  ["1:1", "16:9", "9:16", "4:3", "3:4"].forEach((value) => {
    aspectRatioSelect.createEl("option", { value, text: value });
  });
  const imageCountSelect = createSelectGroup(optionsRow, tr("张数", "Count"));
  Array.from({ length: 9 }, (_, i) => i + 1).forEach((n) => {
    imageCountSelect.createEl("option", {
      value: String(n),
      text: String(n),
    });
  });
  return {
    imageModelSelect,
    resolutionSelect,
    aspectRatioSelect,
    imageCountSelect,
  };
}

function createSelectGroup(
  parent: HTMLElement,
  label: string,
  options?: { cls?: string },
): HTMLSelectElement {
  const group = parent.createDiv("canvas-ai-option-group");
  group.createEl("label", { text: label });
  return group.createEl("select", options);
}

function createPromptSection(parent: HTMLElement, tr: Translator) {
  const zone2 = parent.createDiv("sidebar-zone-2");
  const zone2Header = zone2.createDiv("sidebar-zone-2-header");
  zone2Header.createDiv({
    cls: "sidebar-section-title",
    text: "Prompt",
  });
  const zone2Actions = zone2Header.createDiv("sidebar-zone-2-actions");
  const switchElements = createImageToImageSwitch(zone2Actions, tr);
  createHintButton(zone2Actions, tr);
  const generationStatusEl = zone2Header.createDiv({
    cls: "sidebar-generation-status is-idle",
    text: "",
  });
  const imageElements = createImageToImagePanel(zone2, tr);
  const inputElements = createPromptInput(zone2, tr);
  return {
    ...switchElements,
    generationStatusEl,
    ...imageElements,
    ...inputElements,
  };
}

function createImageToImageSwitch(parent: HTMLElement, tr: Translator) {
  const wrap = parent.createDiv("sidebar-img2img-switch-wrap");
  wrap.createDiv({
    cls: "sidebar-img2img-switch-label",
    text: tr("图生图", "Image-to-Image"),
  });
  const imageToImageToggleBtn = wrap.createEl("button", {
    cls: "sidebar-img2img-switch",
    attr: {
      type: "button",
      "aria-label": tr("图生图开关", "Image-to-Image Switch"),
      "aria-pressed": "false",
    },
  });
  imageToImageToggleBtn.createSpan({ cls: "sidebar-img2img-switch-knob" });
  const imageToImageStateEl = wrap.createDiv({
    cls: "sidebar-img2img-switch-state",
    text: tr("关", "Off"),
  });
  return { imageToImageToggleBtn, imageToImageStateEl };
}

function createHintButton(parent: HTMLElement, tr: Translator): void {
  const hintWrap = parent.createDiv("sidebar-hint-wrap");
  const hintBtn = hintWrap.createEl("button", {
    cls: "sidebar-hint-btn",
    attr: { "aria-label": tr("使用提示", "Usage Tip"), type: "button" },
  });
  setIcon(hintBtn, "info");
  hintWrap.createDiv({
    cls: "sidebar-hint-tooltip",
    text: tr(
      "输入需求后点击生成；从候选图中选择并插入到笔记。可用 @current_note 自动引用当前笔记内容。",
      "Enter prompt and click Generate; then choose a candidate and insert into note. Use @current_note to inject current note context.",
    ),
  });
}

function createImageToImagePanel(parent: HTMLElement, tr: Translator) {
  const modeRow = parent.createDiv("sidebar-zone-2-mode-row");
  const imageToImagePanelEl = modeRow.createDiv(
    "sidebar-img2img-panel is-hidden",
  );
  const imageToImageUploadBtn = imageToImagePanelEl.createEl("button", {
    cls: "sidebar-img2img-upload-btn",
    text: tr("参考图", "Reference"),
    attr: { type: "button" },
  });
  const imageToImagePreviewWrapEl = imageToImagePanelEl.createDiv({
    cls: "sidebar-img2img-preview-wrap",
  });
  const imageToImagePreviewEl = imageToImagePreviewWrapEl.createEl("img", {
    cls: "sidebar-img2img-preview",
    attr: { alt: tr("参考图预览", "Reference Preview") },
  });
  const imageToImageFileNameEl = imageToImagePreviewWrapEl.createDiv({
    cls: "sidebar-img2img-file-name",
    text: tr("未选择图片", "No image selected"),
  });
  const imageToImageClearBtn = imageToImagePanelEl.createEl("button", {
    cls: "sidebar-img2img-clear-btn",
    text: tr("清空", "Clear"),
    attr: { type: "button" },
  });
  const imageToImageFileInput = imageToImagePanelEl.createEl("input", {
    cls: "sidebar-img2img-file-input",
    attr: { type: "file", accept: "image/*" },
  });
  return {
    imageToImagePanelEl,
    imageToImageUploadBtn,
    imageToImagePreviewWrapEl,
    imageToImagePreviewEl,
    imageToImageFileNameEl,
    imageToImageClearBtn,
    imageToImageFileInput,
  };
}

function createPromptInput(parent: HTMLElement, tr: Translator) {
  const inputRow = parent.createDiv("sidebar-zone-2-row");
  const inputEl = inputRow.createEl("textarea", {
    cls: "canvas-ai-prompt-input sidebar-horizontal-input",
    attr: {
      placeholder: tr(
        "输入你要生成的图片描述（可结合预设，支持 @current_note）",
        "Describe the image you want to generate (optional with preset, supports @current_note)",
      ),
      rows: "3",
    },
  });
  return { inputEl };
}

function createActionSection(parent: HTMLElement, tr: Translator) {
  const actionCol = parent.createDiv("sidebar-zone-2-action-col");
  const optimizePromptBtn = actionCol.createEl("button", {
    cls: "canvas-ai-optimize-btn sidebar-horizontal-optimize-btn",
    text: tr("优化", "Optimize"),
    attr: { type: "button" },
  });
  const generateBtn = actionCol.createEl("button", {
    cls: "canvas-ai-generate-btn sidebar-horizontal-generate-btn",
    text: tr("生成", "Generate"),
  });
  const cancelBtn = actionCol.createEl("button", {
    cls: "canvas-ai-cancel-btn sidebar-horizontal-cancel-btn",
    text: tr("取消", "Cancel"),
  });
  return { optimizePromptBtn, generateBtn, cancelBtn };
}
