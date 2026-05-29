import { Notice, Setting } from "obsidian";
import type CanvasAIPlugin from "../../main";
import { t } from "../../lang/helpers";
import { formatProviderName } from "../utils/format-utils";
import type { CanvasAISettings, QuickSwitchModel } from "./settings";
import type { OpenRouterModel } from "./settings-model-catalog";

export class SettingsModelControls {
  private readonly plugin: CanvasAIPlugin;
  private readonly modelCache: OpenRouterModel[];
  private readonly refresh: () => void;

  constructor(
    plugin: CanvasAIPlugin,
    modelCache: OpenRouterModel[],
    refresh: () => void,
  ) {
    this.plugin = plugin;
    this.modelCache = modelCache;
    this.refresh = refresh;
  }

  public renderQuickSwitchCompact(containerEl: HTMLElement): void {
    const imageModels = this.plugin.settings.quickSwitchImageModels || [];
    const imageRow = containerEl.createDiv({
      cls: "canvas-ai-quick-switch-row",
    });
    imageRow.createSpan({
      text: `${t("Quick switch image models")}: `,
      cls: "canvas-ai-quick-switch-label",
    });
    const imageTagsContainer = imageRow.createSpan({
      cls: "canvas-ai-quick-switch-tags",
    });

    if (imageModels.length === 0) {
      imageTagsContainer.createSpan({
        text: t("No quick switch models"),
        cls: "canvas-ai-quick-switch-empty",
      });
      return;
    }

    imageModels.forEach((model, index) => {
      this.createDraggableTag(imageTagsContainer, model, index, imageModels);
    });
  }

  public renderModelSetting(
    containerEl: HTMLElement,
    options: {
      name: string;
      desc: string;
      modelKey: keyof CanvasAISettings;
      customKey: keyof CanvasAISettings;
      placeholder: string;
      getModels: () => OpenRouterModel[];
    },
  ): void {
    const { name, desc, modelKey, customKey, placeholder, getModels } = options;
    const useCustom = this.plugin.settings[customKey] as boolean;
    const models = getModels();
    const hasModels = models.length > 0;
    const isManualMode = useCustom || !hasModels;
    const modelSetting = new Setting(containerEl).setName(name).setDesc(desc);

    if (isManualMode) {
      this.addManualModelInput(modelSetting, modelKey, placeholder);
      if (!hasModels && !useCustom) {
        modelSetting.descEl.createEl("div", {
          text: t("No models available"),
          cls: "canvas-ai-model-hint",
          attr: { style: "color: var(--text-muted); font-size: 0.8em;" },
        });
      }
    } else {
      this.addModelDropdown(modelSetting, modelKey, models);
    }

    this.addQuickSwitchButton(modelSetting, modelKey);
    this.addManualModeToggle(containerEl, customKey, isManualMode, useCustom);
  }

  private createDraggableTag(
    container: HTMLElement,
    model: QuickSwitchModel,
    index: number,
    models: QuickSwitchModel[],
  ): void {
    const tag = container.createSpan({ cls: "canvas-ai-quick-switch-tag" });
    tag.setAttribute("draggable", "true");
    tag.dataset.index = String(index);
    tag.addClass(`canvas-ai-provider--${model.provider}`);
    tag.createSpan({
      text: `${model.displayName} | ${formatProviderName(model.provider)}`,
    });
    const removeBtn = tag.createSpan({
      text: " ×",
      cls: "canvas-ai-quick-switch-remove",
    });

    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void (async () => {
        models.splice(index, 1);
        this.plugin.settings.quickSwitchImageModels = models;
        await this.plugin.saveSettings();
        new Notice(t("Model removed"));
        this.refresh();
      })();
    });

    tag.addEventListener("dragstart", (e) => {
      tag.addClass("dragging");
      e.dataTransfer?.setData("text/plain", String(index));
    });
    tag.addEventListener("dragend", () => tag.removeClass("dragging"));
    tag.addEventListener("dragover", (e) => {
      e.preventDefault();
      tag.addClass("drag-over");
    });
    tag.addEventListener("dragleave", () => tag.removeClass("drag-over"));
    tag.addEventListener("drop", (e) => {
      e.preventDefault();
      tag.removeClass("drag-over");
      const fromIndex = parseInt(e.dataTransfer?.getData("text/plain") || "-1");
      if (fromIndex < 0 || fromIndex === index) return;
      void (async () => {
        const [moved] = models.splice(fromIndex, 1);
        models.splice(index, 0, moved);
        this.plugin.settings.quickSwitchImageModels = models;
        await this.plugin.saveSettings();
        this.refresh();
      })();
    });
  }

  private addManualModelInput(
    setting: Setting,
    modelKey: keyof CanvasAISettings,
    placeholder: string,
  ): void {
    setting.addText((text) =>
      text
        .setPlaceholder(placeholder)
        .setValue((this.plugin.settings[modelKey] as string) || "")
        .onChange(async (value) => {
          (this.plugin.settings[modelKey] as string) = value;
          await this.plugin.saveSettings();
        }),
    );
  }

  private addModelDropdown(
    setting: Setting,
    modelKey: keyof CanvasAISettings,
    models: OpenRouterModel[],
  ): void {
    setting.addDropdown((dropdown) => {
      const currentValue = this.plugin.settings[modelKey] as string;
      const modelIds = models.map((m) => m.id);
      if (currentValue && !modelIds.includes(currentValue)) {
        dropdown.addOption(currentValue, `${currentValue} (Current)`);
      }
      for (const model of models) {
        dropdown.addOption(model.id, model.name || model.id);
      }

      dropdown.setValue(currentValue || "");
      dropdown.onChange(async (value) => {
        (this.plugin.settings[modelKey] as string) = value;
        await this.plugin.saveSettings();
      });
      dropdown.selectEl.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const options = Array.from(dropdown.selectEl.options);
        const currentIndex = dropdown.selectEl.selectedIndex;
        if (options.length === 0 || currentIndex < 0) return;
        const nextIndex =
          event.key === "ArrowDown"
            ? Math.min(options.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1);
        if (nextIndex === currentIndex) return;
        const nextValue = options[nextIndex].value;
        dropdown.setValue(nextValue);
        void (async () => {
          (this.plugin.settings[modelKey] as string) = nextValue;
          await this.plugin.saveSettings();
        })();
      });
    });
  }

  private addQuickSwitchButton(
    setting: Setting,
    modelKey: keyof CanvasAISettings,
  ): void {
    const currentModelId = this.plugin.settings[modelKey] as string;
    if (!currentModelId) return;

    setting.addButton((btn) =>
      btn.setButtonText(t("Add to quick switch")).onClick(async () => {
        const modelIdNow = this.plugin.settings[modelKey] as string;
        if (!modelIdNow) {
          new Notice(t("No model selected"));
          return;
        }

        const provider = this.plugin.settings.apiProvider;
        const targetList = this.plugin.settings.quickSwitchImageModels || [];
        const key = `${provider}|${modelIdNow}`;
        if (targetList.some((m) => `${m.provider}|${m.modelId}` === key)) {
          new Notice(t("Model already exists"));
          return;
        }

        targetList.push({
          provider,
          modelId: modelIdNow,
          displayName: this.getModelDisplayName(modelIdNow),
        });
        this.plugin.settings.quickSwitchImageModels = targetList;
        await this.plugin.saveSettings();
        new Notice(t("Model added"));
        this.refresh();
      }),
    );
  }

  private addManualModeToggle(
    containerEl: HTMLElement,
    customKey: keyof CanvasAISettings,
    isManualMode: boolean,
    useCustom: boolean,
  ): void {
    new Setting(containerEl)
      .setName(t("Manually enter model name"))
      .setDesc(
        isManualMode ? t("Disable manual model") : t("Enable manual model"),
      )
      .addToggle((toggle) =>
        toggle.setValue(useCustom || false).onChange(async (value) => {
          (this.plugin.settings[customKey] as boolean) = value;
          await this.plugin.saveSettings();
          this.refresh();
        }),
      );
  }

  private getModelDisplayName(modelId: string): string {
    const cached = this.modelCache.find((m) => m.id === modelId);
    if (cached) {
      const name = cached.name;
      const colonIndex = name.indexOf(": ");
      if (colonIndex > -1 && colonIndex < 20) {
        return name.substring(colonIndex + 2);
      }
      return name;
    }
    return modelId.split("/").pop() || modelId;
  }
}
