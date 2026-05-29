/**
 * Lingxi Settings Tab
 * 插件设置界面
 */

import {
  App,
  PluginSettingTab,
  Setting,
  requestUrl,
  Notice,
} from "obsidian";
import type CanvasAIPlugin from "../../main";
import { ApiProvider } from "./settings";
import { t } from "../../lang/helpers";
import {
  getGeminiHardcodedModels,
  getImageModels,
  getOpenAIHardcodedModels,
  getTextModels,
} from "./settings-model-catalog";
import type { OpenRouterModel } from "./settings-model-catalog";
import { SettingsModelControls } from "./settings-model-controls";
import { SettingsProviderSection } from "./settings-provider-section";

// ========== Settings Tab ==========

export class CanvasAISettingTab extends PluginSettingTab {
  plugin: CanvasAIPlugin;
  private modelCache: OpenRouterModel[] = [];
  private modelsFetched: boolean = false;
  private isFetching: boolean = false;
  private readonly providerSection: SettingsProviderSection;

  constructor(app: App, plugin: CanvasAIPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.providerSection = new SettingsProviderSection(
      plugin,
      () => void this.display(),
    );
  }

  /**
   * Fetch models from API (OpenRouter) or load hardcoded lists (Gemini/OpenAI)
   */
  private async fetchModels(): Promise<void> {
    if (this.isFetching) return;

    const provider = this.plugin.settings.apiProvider;
    const isGemini = provider === "gemini"; // Gemini uses hardcoded model list (no API endpoint)
    const isOpenAI = provider === "openai"; // OpenAI uses curated model list
    const isCodex = provider === "codex";
    if (isCodex) {
      this.modelCache = [];
      this.modelsFetched = true;
      void this.display();
      return;
    }
    if (isGemini) {
      this.modelCache = getGeminiHardcodedModels();
      this.modelsFetched = true;
      console.debug(
        `Lingxi Settings: Loaded ${this.modelCache.length} hardcoded Gemini models`,
      );
      void this.display();
      return;
    }
    if (isOpenAI) {
      this.modelCache = getOpenAIHardcodedModels();
      this.modelsFetched = true;
      console.debug(
        `Lingxi Settings: Loaded ${this.modelCache.length} hardcoded OpenAI models`,
      );
      void this.display();
      return;
    }
    const apiKey = this.plugin.settings.openRouterApiKey;

    if (!apiKey) {
      console.debug("Lingxi Settings: No API key, skipping model fetch");
      return;
    }

    this.isFetching = true;
    try {
      const endpoint = "https://openrouter.ai/api/v1/models";
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };

      const response = await requestUrl({
        url: endpoint,
        method: "GET",
        headers: headers,
      });

      const data = response.json;

      // Parse and cache model info
      interface ModelData {
        id?: string;
        name?: string;
        architecture?: { output_modalities?: string[] };
      }
      this.modelCache = (data.data || []).map((m: ModelData) => ({
        id: m.id || "",
        name: m.name || m.id || "",
        outputModalities: m.architecture?.output_modalities || ["text"],
      }));

      this.modelsFetched = true;
      console.debug(
        `Lingxi Settings: Fetched ${this.modelCache.length} models from OpenRouter`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Lingxi Settings: Failed to fetch models:", message);
      // Keep existing cache or empty
      new Notice(`Failed to fetch model list: ${message}`);
    } finally {
      this.isFetching = false;
      // Update UI after fetch completes (success or error)
      void this.display();
    }
  }

  private getTextModels(): OpenRouterModel[] {
    return getTextModels(
      this.plugin.settings.apiProvider,
      this.modelCache,
      !!this.plugin.settings.showAllTextModelsInSettings,
    );
  }

  private getImageModels(): OpenRouterModel[] {
    return getImageModels(this.plugin.settings.apiProvider, this.modelCache);
  }

  display(): void {
    const { containerEl } = this;
    const openAIProviderLabel = ["Open", "AI"].join("");
    const codexProviderLabel = ["Codex", "CLI"].join(" ");
    containerEl.empty();
    containerEl.addClass("canvas-ai-settings");

    new Setting(containerEl).setHeading().setName(t("SettingTitle"));

    // ========== API Provider Selection ==========
    new Setting(containerEl).setHeading().setName(t("API configuration"));

    new Setting(containerEl)
      .setName(t("API provider"))
      .setDesc(t("Select API provider"))
      .addDropdown((dropdown) =>
        dropdown

          .addOption("gemini", t("Google Gemini"))
          .addOption("openai", openAIProviderLabel)
          .addOption("openrouter", t("OpenRouter"))
          .addOption("codex", codexProviderLabel)
          .setValue(
            (() => {
              const rawProvider = this.plugin.settings.apiProvider as string;
              const supported = new Set([
                "openrouter",
                "openai",
                "gemini",
                "codex",
              ]);
              return supported.has(rawProvider) ? rawProvider : "openrouter";
            })(),
          )
          .onChange(async (value) => {
            this.plugin.settings.apiProvider = value as ApiProvider;
            await this.plugin.saveSettings();

            // Auto-refresh models when switching provider (Non-blocking)
            this.modelsFetched = false;
            void this.fetchModels(); // Fire and forget

            // Re-render immediately to show/hide provider-specific settings
            void this.display();
          }),
      );

    const rawProvider = this.plugin.settings.apiProvider as string;
    const provider = (
      ["openrouter", "openai", "gemini", "codex"].includes(rawProvider)
        ? rawProvider
        : "openrouter"
    ) as ApiProvider;

    if (provider !== rawProvider) {
      this.plugin.settings.apiProvider = provider;
      void this.plugin.saveSettings();
    }

    const isGemini = provider === "gemini";
    const isOpenAI = provider === "openai";
    const isCodex = provider === "codex";

    // ========== Configuration Section ==========
    this.providerSection.render(containerEl, provider);

    if (!isCodex) {
      // ========== 模型配置区域 ==========
      new Setting(containerEl).setHeading().setName(t("Model configuration"));

      // Fetch models if not already fetched (Non-blocking)
      // For Gemini/OpenAI, use hardcoded list; for OpenRouter, fetch from API
      const apiKey = isGemini
        ? this.plugin.settings.geminiApiKey
        : isOpenAI
          ? this.plugin.settings.openAIApiKey
          : this.plugin.settings.openRouterApiKey;
      if (!this.modelsFetched && apiKey && !this.isFetching) {
        setTimeout(() => void this.fetchModels(), 0);
      }

      // Refresh button - show status for all providers
      let statusText = t("Click refresh");
      if (this.isFetching) {
        statusText = t("Fetching...");
      } else if (this.modelsFetched) {
        const source = isGemini
          ? "Gemini (Hardcoded)"
          : isOpenAI
            ? "OpenAI (Hardcoded)"
            : "OpenRouter";
        statusText = t("Loaded models", {
          count: this.modelCache.length,
          textCount: this.getTextModels().length,
          imageCount: this.getImageModels().length,
          source: source,
        });
      }

      const refreshSetting = new Setting(containerEl)
        .setName(t("Model list"))
        .setDesc(statusText);

      // Only show refresh button for OpenRouter (Gemini/OpenAI use hardcoded list)
      if (!isGemini && !isOpenAI) {
        const refreshBtn = refreshSetting.controlEl.createEl("button", {
          text: this.isFetching ? t("Refreshing...") : t("Refresh model list"),
          cls: "canvas-ai-refresh-btn",
        });

        refreshBtn.disabled = this.isFetching;

        refreshBtn.addEventListener("click", () => {
          refreshBtn.textContent = "Fetching...";
          refreshBtn.disabled = true;
          this.modelsFetched = false; // Force refresh
          void this.fetchModels(); // Fire and forget
          // UI will be updated by fetchModels finally block
        });
      }

      new Setting(containerEl)
        .setName(t("Show all text models (Advanced)"))
        .setDesc(
          t(
            "By default, only 2 recommended text models are shown: gpt-4o-mini, gemini-2.5-flash",
          ),
        )
        .addToggle((toggle) =>
          toggle
            .setValue(!!this.plugin.settings.showAllTextModelsInSettings)
            .onChange(async (value) => {
              this.plugin.settings.showAllTextModelsInSettings = value;
              await this.plugin.saveSettings();
              this.display();
            }),
        );

      // ========== Quick Switch Models (Compact Display) ==========
      const modelControls = new SettingsModelControls(
        this.plugin,
        this.modelCache,
        () => void this.display(),
      );
      modelControls.renderQuickSwitchCompact(containerEl);

      // ========== Image Model Setting ==========
      const imageModelKey = isGemini
        ? "geminiImageModel"
        : isOpenAI
          ? "openAIImageModel"
          : "openRouterImageModel";
      const imageCustomKey = isGemini
        ? "geminiUseCustomImageModel"
        : isOpenAI
          ? "openAIUseCustomImageModel"
          : "openRouterUseCustomImageModel";
      const imagePlaceholder = isGemini
        ? "gemini-3-pro-image-preview"
        : isOpenAI
          ? "gpt-image-2"
          : "google/gemini-3-pro-image-preview";

      modelControls.renderModelSetting(containerEl, {
        name: t("Image generation model"),
        desc: t("Image generation model"),
        modelKey: imageModelKey,
        customKey: imageCustomKey,
        placeholder: imagePlaceholder,
        getModels: () => this.getImageModels(),
      });
    }

    // 图片优化区域
    new Setting(containerEl)
      .setHeading()
      .setName(t("Image optimization"))
      .setDesc(t("Image optimization desc"));

    new Setting(containerEl)
      .setName(t("Image compression quality"))
      .setDesc(t("Image compression quality"))
      .addSlider((slider) =>
        slider
          .setLimits(1, 100, 1)
          .setValue(this.plugin.settings.imageCompressionQuality)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.imageCompressionQuality = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("Image max size"))
      .setDesc(t("Image max size"))
      .addText((text) =>
        text
          .setPlaceholder("2048")
          .setValue(String(this.plugin.settings.imageMaxSize))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.imageMaxSize = num;
              await this.plugin.saveSettings();
            }
          })
          .inputEl.addClass("canvas-ai-small-input"),
      );

    new Setting(containerEl)
      .setName(t("Image save location"))
      .setDesc(
        t(
          "Specify a folder path in vault, e.g. Assets/AI (leave empty to save next to current note)",
        ),
      )
      .addText((text) =>
        text
          .setPlaceholder("Assets/AI")
          .setValue(this.plugin.settings.imageSaveFolder || "")
          .onChange(async (value) => {
            this.plugin.settings.imageSaveFolder = value.trim();
            await this.plugin.saveSettings();
          })
          .inputEl.addClass("canvas-ai-small-input"),
      );

    // ========== Prompt Settings ==========
    new Setting(containerEl).setHeading().setName(t("Prompt settings"));

    // Image System Prompt
    new Setting(containerEl)
      .setClass("canvas-ai-block-setting")
      .setName(t("Image system prompt"))
      .setDesc(t("System prompt for image generation mode"))
      .addTextArea((text) =>
        text
          .setPlaceholder("You are an expert creator...")
          .setValue(this.plugin.settings.imageSystemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.imageSystemPrompt = value;
            await this.plugin.saveSettings();
          }),
      );

    // ========== Developer Options ==========
    new Setting(containerEl).setHeading().setName(t("Developer options"));

    new Setting(containerEl)
      .setName(t("Debug mode"))
      .setDesc(t("Debug mode"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debugMode)
          .onChange(async (value) => {
            this.plugin.settings.debugMode = value;
            await this.plugin.saveSettings();
            // Re-render settings to show/hide experimental options
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName(t("Image Generation Timeout"))
      .setDesc(t("Image Generation Timeout Desc"))
      .addText((text) =>
        text
          .setPlaceholder("120")
          .setValue(String(this.plugin.settings.imageGenerationTimeout || 120))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.imageGenerationTimeout = num;
              await this.plugin.saveSettings();
            }
          }),
      )
      .then((setting) => {
        // Make the input narrower
        const inputEl = setting.controlEl.querySelector("input");
        if (inputEl) {
          inputEl.addClass("canvas-ai-timeout-input");
          inputEl.type = "number";
          inputEl.min = "10";
          inputEl.max = "600";
        }
      });
  }

}
