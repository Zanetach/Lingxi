import {
  requestUrl,
  setIcon,
  Setting,
} from "obsidian";
import type CanvasAIPlugin from "../../main";
import { t } from "../../lang/helpers";
import { ApiManager } from "../api/api-manager";
import { CodexCliProvider } from "../api/providers/codex-cli";
import { DEFAULT_CODEX_ARGS, type ApiProvider } from "./settings";

export class SettingsProviderSection {
  private codexDetectionInProgress = false;
  private codexStatusKey = "";
  private codexStatusText = "";
  private codexStatusIsError = false;

  private readonly plugin: CanvasAIPlugin;
  private readonly refresh: () => void;

  constructor(plugin: CanvasAIPlugin, refresh: () => void) {
    this.plugin = plugin;
    this.refresh = refresh;
  }

  public render(containerEl: HTMLElement, provider: ApiProvider): void {
    if (provider === "openrouter") {
      this.renderOpenRouter(containerEl);
    } else if (provider === "openai") {
      this.renderOpenAI(containerEl);
    } else if (provider === "gemini") {
      this.renderGemini(containerEl);
    } else if (provider === "codex") {
      this.renderCodex(containerEl);
    }
  }

  private renderOpenRouter(containerEl: HTMLElement): void {
    const apiKeySetting = new Setting(containerEl)
      .setName(t("OpenRouter API key"))
      .setDesc(t("Enter your OpenRouter API key"))
      .addText((text) =>
        text
          .setPlaceholder(t("Placeholder API key OpenRouter"))
          .setValue(this.plugin.settings.openRouterApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openRouterApiKey = value;
            await this.plugin.saveSettings();
          }),
      );
    this.attachSecretToggle(apiKeySetting);
    this.addTestButton(apiKeySetting.controlEl, containerEl);

    new Setting(containerEl)
      .setName(t("API base URL"))
      .setDesc(t("API base URL"))
      .addText((text) =>
        text
          .setPlaceholder("https://openrouter.ai")
          .setValue(this.plugin.settings.openRouterBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.openRouterBaseUrl = value;
            await this.plugin.saveSettings();
          }),
      );
  }

  private renderOpenAI(containerEl: HTMLElement): void {
    const openaiKeySetting = new Setting(containerEl)
      .setName(t("OpenAI API key"))
      .setDesc(t("Enter your OpenAI API key"))
      .addText((text) =>
        text
          .setPlaceholder(t("Placeholder API key"))
          .setValue(this.plugin.settings.openAIApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openAIApiKey = value;
            await this.plugin.saveSettings();
          }),
      );
    this.attachSecretToggle(openaiKeySetting);
    this.addTestButton(openaiKeySetting.controlEl, containerEl);

    new Setting(containerEl)
      .setName(t("API base URL"))
      .setDesc(t("OpenAI compatible base URL"))
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com")
          .setValue(this.plugin.settings.openAIBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.openAIBaseUrl = value;
            await this.plugin.saveSettings();
          }),
      );
  }

  private renderGemini(containerEl: HTMLElement): void {
    const geminiKeySetting = new Setting(containerEl)
      .setName(t("Gemini API key"))
      .setDesc(t("Enter your Gemini API key"))
      .addText((text) =>
        text
          .setPlaceholder(t("Placeholder API key Gemini"))
          .setValue(this.plugin.settings.geminiApiKey)
          .onChange(async (value) => {
            this.plugin.settings.geminiApiKey = value;
            await this.plugin.saveSettings();
          }),
      );
    this.attachSecretToggle(geminiKeySetting);
    this.addTestButton(geminiKeySetting.controlEl, containerEl);

    new Setting(containerEl)
      .setName(t("API base URL"))
      .setDesc(t("API base URL"))
      .addText((text) =>
        text
          .setPlaceholder("https://generativelanguage.googleapis.com")
          .setValue(this.plugin.settings.geminiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.geminiBaseUrl = value;
            await this.plugin.saveSettings();
          }),
      );
  }

  private renderCodex(containerEl: HTMLElement): void {
    const defaultCodexCommand = ["co", "dex"].join("");

    new Setting(containerEl)
      .setName(t("Codex command"))
      .setDesc(t("Codex command desc"))
      .addText((text) =>
        text
          .setPlaceholder(defaultCodexCommand)
          .setValue(this.plugin.settings.codexCommand || defaultCodexCommand)
          .onChange(async (value) => {
            this.plugin.settings.codexCommand =
              value.trim() || defaultCodexCommand;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("Codex arguments"))
      .setDesc(t("Codex arguments desc"))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_CODEX_ARGS)
          .setValue(this.plugin.settings.codexArgs || "")
          .onChange(async (value) => {
            this.plugin.settings.codexArgs = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("Codex working directory"))
      .setDesc(t("Codex working directory desc"))
      .addText((text) =>
        text
          .setPlaceholder(t("Codex working directory placeholder"))
          .setValue(this.plugin.settings.codexWorkingDir || "")
          .onChange(async (value) => {
            this.plugin.settings.codexWorkingDir = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    this.renderCodexStatus(containerEl);
  }

  private addTestButton(parentEl: HTMLElement, resultContainer: HTMLElement) {
    const testBtn = parentEl.createEl("button", {
      text: t("Test connection"),
      cls: "canvas-ai-test-btn",
    });
    const testResultEl = resultContainer.createDiv({
      cls: "canvas-ai-test-result is-hidden",
    });

    testBtn.addEventListener("click", () => {
      void (async () => {
        testBtn.textContent = t("Testing...");
        testBtn.disabled = true;
        testResultEl.addClass("is-hidden");

        try {
          await this.probeCurrentProvider();
          testBtn.textContent = t("Success");
          testBtn.addClass("success");
          testResultEl.textContent = `✓ ${t("Connection successful")}`;
          testResultEl.removeClass("error");
          testResultEl.addClass("success");
          testResultEl.removeClass("is-hidden");
          this.resetTestButton(testBtn, "success");
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          testBtn.textContent = t("Failed");
          testBtn.addClass("error");
          testResultEl.textContent = `✗ ${t("Connection failed")}: ${message}`;
          testResultEl.removeClass("success");
          testResultEl.addClass("error");
          testResultEl.removeClass("is-hidden");
          this.resetTestButton(testBtn, "error");
        }
      })();
    });
  }

  private async probeCurrentProvider(): Promise<void> {
    const apiManager = new ApiManager(this.plugin.settings);
    if (!apiManager.isConfigured()) {
      throw new Error("Please enter API Key first");
    }

    try {
      await apiManager.chatCompletion('Say "Connection successful!" in one line.');
    } catch (chatErr: unknown) {
      const msg = chatErr instanceof Error ? chatErr.message : String(chatErr);
      if (!msg.includes("404")) throw chatErr;
      const baseUrl = (
        this.plugin.settings.openAIBaseUrl || "https://api.openai.com/v1"
      ).replace(/\/+$/, "");
      const apiKey = this.plugin.settings.openAIApiKey || "";
      const res = await requestUrl({
        url: `${baseUrl}/models`,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        throw: false,
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Auth failed (${res.status}): check your API key`);
      }
    }
  }

  private resetTestButton(
    testBtn: HTMLButtonElement,
    className: "success" | "error",
  ): void {
    setTimeout(() => {
      testBtn.textContent = t("Test connection");
      testBtn.removeClass(className);
      testBtn.disabled = false;
    }, 3000);
  }

  private renderCodexStatus(containerEl: HTMLElement): void {
    const statusText = this.codexDetectionInProgress
      ? t("Checking Codex CLI")
      : this.codexStatusText || t("Codex CLI not checked");
    const statusSetting = new Setting(containerEl)
      .setName(t("Codex status"))
      .setDesc(statusText);

    statusSetting.descEl.toggleClass("is-error", this.codexStatusIsError);
    statusSetting.addButton((button) =>
      button
        .setButtonText(
          this.codexDetectionInProgress
            ? t("Testing...")
            : t("Refresh Codex status"),
        )
        .setDisabled(this.codexDetectionInProgress)
        .onClick(() => {
          this.startCodexEnvironmentCheck(true);
        }),
    );

    this.startCodexEnvironmentCheck(false);
  }

  private startCodexEnvironmentCheck(force: boolean): void {
    const key = [
      this.plugin.settings.codexCommand || "",
      this.plugin.settings.codexWorkingDir || "",
    ].join("\n");
    if (!force && (this.codexDetectionInProgress || this.codexStatusKey === key)) {
      return;
    }

    this.codexDetectionInProgress = true;
    this.codexStatusKey = key;
    this.codexStatusText = t("Checking Codex CLI");
    this.codexStatusIsError = false;
    if (force) this.refresh();

    void (async () => {
      try {
        const provider = new CodexCliProvider(this.plugin.settings);
        const output = await provider.checkEnvironment();
        this.codexStatusText = t("Codex CLI detected", {
          output: output.split("\n")[0] || "ok",
        });
        this.codexStatusIsError = false;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.codexStatusText = t("Codex CLI unavailable", { message });
        this.codexStatusIsError = true;
      } finally {
        this.codexDetectionInProgress = false;
        this.refresh();
      }
    })();
  }

  private attachSecretToggle(setting: Setting): void {
    const inputEl = setting.controlEl.querySelector("input");
    if (!inputEl) return;

    inputEl.type = "password";
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;
    inputEl.addClass("canvas-ai-secret-input");

    const toggleBtn = setting.controlEl.createEl("button", {
      cls: "canvas-ai-secret-toggle",
      attr: { type: "button", "aria-label": "Toggle secret visibility" },
    });

    const syncIcon = () => {
      const isMasked = inputEl.type === "password";
      setIcon(toggleBtn, isMasked ? "eye" : "eye-off");
      toggleBtn.setAttr("title", isMasked ? "Show key" : "Hide key");
    };

    syncIcon();
    toggleBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      inputEl.type = inputEl.type === "password" ? "text" : "password";
      syncIcon();
      inputEl.focus();
    });
  }
}
