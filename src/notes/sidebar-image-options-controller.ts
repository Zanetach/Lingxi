import type CanvasAIPlugin from "../../main";
import type { QuickSwitchModel } from "../settings/settings";

type Translator = (zh: string, en: string) => string;

export interface SidebarImageOptionElements {
  imageModelSelect: HTMLSelectElement;
  resolutionSelect: HTMLSelectElement;
  aspectRatioSelect: HTMLSelectElement;
  imageCountSelect: HTMLSelectElement;
}

export class SidebarImageOptionsController {
  private plugin: CanvasAIPlugin;
  private elements: SidebarImageOptionElements;
  private tr: Translator;
  private quickSwitchImageModels: QuickSwitchModel[] = [];
  private selectedImageModel = "";

  constructor(
    plugin: CanvasAIPlugin,
    elements: SidebarImageOptionElements,
    tr: Translator,
  ) {
    this.plugin = plugin;
    this.elements = elements;
    this.tr = tr;
  }

  public initFromSettings(): void {
    const supportedProviders = new Set([
      "openrouter",
      "openai",
      "gemini",
      "codex",
    ]);
    this.quickSwitchImageModels = [
      ...(this.plugin.settings.quickSwitchImageModels || []),
    ].filter((model) => supportedProviders.has(String(model.provider || "")));

    if (
      this.quickSwitchImageModels.length !==
      (this.plugin.settings.quickSwitchImageModels || []).length
    ) {
      this.plugin.settings.quickSwitchImageModels = [
        ...this.quickSwitchImageModels,
      ];
      void this.plugin.saveSettings();
    }

    const rawSelectedModel = this.plugin.settings.paletteImageModel || "";
    const selectedProvider = rawSelectedModel.split("|")[0] || "";
    this.selectedImageModel = supportedProviders.has(selectedProvider)
      ? rawSelectedModel
      : "";
    if (rawSelectedModel !== this.selectedImageModel) {
      this.plugin.settings.paletteImageModel = this.selectedImageModel;
      void this.plugin.saveSettings();
    }

    this.rebuildImageModelSelect();
    this.elements.resolutionSelect.value =
      this.plugin.settings.defaultResolution || "1K";
    this.elements.aspectRatioSelect.value =
      this.plugin.settings.defaultAspectRatio || "1:1";
    const safeCount = Math.min(
      9,
      Math.max(1, this.plugin.settings.defaultImageCount || 4),
    );
    this.elements.imageCountSelect.value = String(safeCount);
    this.plugin.settings.defaultImageCount = safeCount;
  }

  public handleImageModelChange(value: string): void {
    this.selectedImageModel = value;
    this.plugin.settings.paletteImageModel = this.selectedImageModel;
    void this.plugin.saveSettings();
  }

  public handleResolutionChange(value: string): void {
    this.plugin.settings.defaultResolution = value;
    void this.plugin.saveSettings();
  }

  public handleAspectRatioChange(value: string): void {
    this.plugin.settings.defaultAspectRatio = value;
    void this.plugin.saveSettings();
  }

  public handleImageCountChange(value: string): void {
    const count = Number.parseInt(value, 10);
    this.plugin.settings.defaultImageCount =
      Number.isFinite(count) && count >= 1 && count <= 9 ? count : 4;
    void this.plugin.saveSettings();
  }

  private rebuildImageModelSelect(): void {
    const select = this.elements.imageModelSelect;
    select.empty();
    select.createEl("option", {
      value: "",
      text: this.tr("使用默认模型", "Use default model"),
    });
    this.quickSwitchImageModels.forEach((model) => {
      const label = `${model.provider}/${model.modelId}`;
      select.createEl("option", {
        value: `${model.provider}|${model.modelId}`,
        text: label,
      });
    });
    if (this.selectedImageModel) select.value = this.selectedImageModel;
  }
}
