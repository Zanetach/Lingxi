import { App, Notice } from "obsidian";
import type CanvasAIPlugin from "../../main";
import type { PromptPreset } from "../settings/settings";
import {
  PresetBrowserModal,
  PresetEditorModal,
} from "./sidebar-modals";

type Translator = (zh: string, en: string) => string;

export interface SidebarPresetElements {
  presetSelect: HTMLSelectElement;
  presetDeleteBtn: HTMLButtonElement;
  recentPresetsListEl: HTMLElement;
}

export interface SidebarPresetCallbacks {
  setInputPromptValue: (
    prompt: string,
    options?: { persist?: boolean; updateState?: boolean },
  ) => void;
  queuePersistSidebarState: () => void;
  updateGenerateButtonState: () => void;
  getPromptValue: () => string;
}

export class SidebarPresetController {
  private app: App;
  private plugin: CanvasAIPlugin;
  private elements: SidebarPresetElements;
  private tr: Translator;
  private callbacks: SidebarPresetCallbacks;
  private imagePresets: PromptPreset[] = [];

  constructor(
    app: App,
    plugin: CanvasAIPlugin,
    elements: SidebarPresetElements,
    tr: Translator,
    callbacks: SidebarPresetCallbacks,
  ) {
    this.app = app;
    this.plugin = plugin;
    this.elements = elements;
    this.tr = tr;
    this.callbacks = callbacks;
  }

  public initFromSettings(): void {
    this.imagePresets = [...(this.plugin.settings.imagePresets || [])];
    const savedPresetId = this.plugin.settings.sidebarSelectedPresetId || "";
    this.rebuildSelect(
      savedPresetId &&
        this.imagePresets.some((preset) => preset.id === savedPresetId)
        ? savedPresetId
        : "",
    );
  }

  public handleSelectChange(selectedId: string): void {
    this.elements.presetDeleteBtn.disabled = !selectedId;
    const selected = this.imagePresets.find((preset) => preset.id === selectedId);
    if (selected) {
      this.callbacks.setInputPromptValue(selected.prompt || "", {
        persist: false,
        updateState: false,
      });
    }
    this.renderRecentPresets();
    this.callbacks.queuePersistSidebarState();
    this.callbacks.updateGenerateButtonState();
  }

  public renderRecentPresets(): void {
    const { recentPresetsListEl } = this.elements;
    if (!recentPresetsListEl) return;
    recentPresetsListEl.empty();
    if (this.imagePresets.length === 0) {
      recentPresetsListEl.createDiv({
        cls: "sidebar-recent-presets-empty",
        text: this.tr("暂无预设", "No presets yet"),
      });
      return;
    }

    const selectedId = this.elements.presetSelect?.value || "";
    [...this.imagePresets].slice(-6).reverse().forEach((preset, index) => {
      const item = recentPresetsListEl.createEl("button", {
        cls: "sidebar-recent-preset-item",
        text: preset.name,
      });
      item.toggleClass("is-active", preset.id === selectedId);
      if (index === 0) {
        item.addClass("is-latest");
        item.setAttribute("title", this.tr("最近添加", "Recently added"));
      }
      item.addEventListener("click", () => this.selectPreset(preset));
    });
  }

  public openBrowser(): void {
    new PresetBrowserModal(this.app, this.imagePresets, (preset) => {
      this.selectPreset(preset, false);
    }).open();
  }

  public openEditor(): void {
    new PresetEditorModal(
      this.app,
      this.imagePresets,
      this.elements.presetSelect?.value || "",
      ({ selectedId, name, prompt }) => {
        void this.savePreset(selectedId, name, prompt);
      },
    ).open();
  }

  public async deleteSelectedPreset(): Promise<void> {
    const selectedId = this.elements.presetSelect?.value || "";
    if (!selectedId) {
      new Notice(this.tr("请先选择一个预设", "Please select a preset first"));
      return;
    }
    const target = this.imagePresets.find((preset) => preset.id === selectedId);
    if (!target) {
      new Notice(this.tr("未找到预设", "Preset not found"));
      return;
    }
    const ok = window.confirm(
      this.tr(`确定删除预设「${target.name}」吗？`, `Delete preset "${target.name}"?`),
    );
    if (!ok) return;

    this.imagePresets = this.imagePresets.filter((preset) => preset.id !== selectedId);
    this.plugin.settings.imagePresets = [...this.imagePresets];
    await this.plugin.saveSettings();
    this.rebuildSelect("");
    this.callbacks.setInputPromptValue("", { persist: false, updateState: false });
    this.plugin.settings.sidebarSelectedPresetId = "";
    this.plugin.settings.sidebarDraftPrompt = this.callbacks.getPromptValue();
    await this.plugin.saveSettings();
    this.callbacks.updateGenerateButtonState();
    new Notice(this.tr("预设已删除", "Preset deleted"));
  }

  private rebuildSelect(selectedId: string = ""): void {
    const { presetSelect, presetDeleteBtn } = this.elements;
    presetSelect.empty();
    presetSelect.createEl("option", {
      value: "",
      text: this.tr("选择预设（可选）", "Select preset (optional)"),
    });
    this.imagePresets.forEach((preset) => {
      presetSelect.createEl("option", {
        value: preset.id,
        text: preset.name,
      });
    });
    presetSelect.value = selectedId;
    presetDeleteBtn.disabled = !presetSelect.value;
    this.renderRecentPresets();
  }

  private selectPreset(preset: PromptPreset, renderRecent = true): void {
    this.elements.presetSelect.value = preset.id;
    this.elements.presetDeleteBtn.disabled = false;
    this.callbacks.setInputPromptValue(preset.prompt || "", {
      persist: false,
      updateState: false,
    });
    if (renderRecent) this.renderRecentPresets();
    this.callbacks.queuePersistSidebarState();
    this.callbacks.updateGenerateButtonState();
  }

  private async savePreset(
    selectedId: string,
    name: string,
    prompt: string,
  ): Promise<void> {
    const idToSelect = this.upsertPreset(selectedId, name, prompt);
    this.plugin.settings.imagePresets = [...this.imagePresets];
    await this.plugin.saveSettings();

    this.rebuildSelect(idToSelect);
    this.callbacks.setInputPromptValue(prompt, {
      persist: false,
      updateState: false,
    });
    this.plugin.settings.sidebarSelectedPresetId = idToSelect;
    this.plugin.settings.sidebarDraftPrompt = this.callbacks.getPromptValue();
    await this.plugin.saveSettings();
    this.callbacks.updateGenerateButtonState();
    new Notice(this.tr("预设已保存", "Preset saved"));
  }

  private upsertPreset(
    selectedId: string,
    name: string,
    prompt: string,
  ): string {
    if (selectedId) {
      const target = this.imagePresets.find((preset) => preset.id === selectedId);
      if (target) {
        target.name = name;
        target.prompt = prompt;
        return selectedId;
      }
    }
    const existedByName = this.imagePresets.find((preset) => preset.name === name);
    if (existedByName) {
      existedByName.prompt = prompt;
      return existedByName.id;
    }
    const created: PromptPreset = {
      id: this.generatePresetId(),
      name,
      prompt,
    };
    this.imagePresets.push(created);
    return created.id;
  }

  private generatePresetId(): string {
    return `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }
}
