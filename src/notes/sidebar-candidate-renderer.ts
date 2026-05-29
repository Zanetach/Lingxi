import { App, Notice, TFile } from "obsidian";
import { ReferenceImagePreviewModal } from "./sidebar-modals";
import type { SidebarImageCandidate } from "./sidebar-candidate-types";

interface SidebarCandidateRendererActions {
  isBulkInserting: () => boolean;
  onInsert: (candidateId: string) => Promise<void>;
  onRegenerate: (candidateId: string) => Promise<void>;
  onCopyPrompt: (candidateId: string) => Promise<void>;
  onDiscard: (candidateId: string) => Promise<void>;
  onCopyEmbed: (candidateId: string) => Promise<void>;
}

export class SidebarCandidateRenderer {
  private readonly app: App;
  private readonly tr: (zh: string, en: string) => string;
  private readonly actions: SidebarCandidateRendererActions;

  constructor(
    app: App,
    tr: (zh: string, en: string) => string,
    actions: SidebarCandidateRendererActions,
  ) {
    this.app = app;
    this.tr = tr;
    this.actions = actions;
  }

  public renderCandidateCard(
    parent: HTMLElement,
    candidate: SidebarImageCandidate,
  ): void {
    const card = parent.createDiv("sidebar-image-candidate-card");
    const previewSrc = this.getCandidatePreviewSrc(candidate);
    const preview = card.createDiv("sidebar-image-candidate-preview");

    const statusText =
      candidate.status === "pending"
        ? this.tr("生成中", "Generating")
        : candidate.status === "ready"
          ? this.tr("待插入", "Ready")
          : this.tr("已插入", "Inserted");
    preview.createDiv({
      cls: `sidebar-image-candidate-status status-${candidate.status}`,
      text: statusText,
    });

    if (candidate.status === "pending") {
      preview.createDiv({ cls: "sidebar-candidate-progress-bar" });
    }

    const actions = preview.createDiv(
      "sidebar-image-candidate-actions-overlay",
    );
    const insertBtn = actions.createEl("button", {
      cls: "mod-cta candidate-btn-insert",
      text: this.tr("插入", "Insert"),
    });
    const regenerateBtn = actions.createEl("button", {
      cls: "candidate-btn-regenerate",
      text: this.tr("重生", "Regenerate"),
    });
    const copyPromptBtn = actions.createEl("button", {
      cls: "candidate-btn-prompt",
      text: this.tr("复制提示", "Copy Prompt"),
    });
    const discardBtn = actions.createEl("button", {
      cls: "candidate-btn-discard",
      text: this.tr("丢弃", "Discard"),
    });
    const copyPathBtn = actions.createEl("button", {
      cls: "candidate-btn-copy",
      text: this.tr("复制嵌入", "Copy Embed"),
    });

    if (previewSrc) {
      const img = preview.createEl("img", {
        attr: { src: previewSrc, alt: candidate.fileName },
      });
      img.loading = "lazy";
      preview.addClass("is-clickable");
      preview.setAttr(
        "title",
        this.tr(
          "悬停或点击显示操作；双击查看大图",
          "Hover/click to show actions; double-click to preview",
        ),
      );
      preview.addEventListener("click", () => {
        card.toggleClass("is-actions-visible", true);
      });
      preview.addEventListener("dblclick", () => {
        this.openCandidatePreviewModal(candidate, previewSrc);
      });
    } else {
      preview.createDiv({
        cls: "sidebar-image-candidate-preview-empty",
        text: this.tr("图片预览不可用", "Preview unavailable"),
      });
      card.addClass("is-actions-visible");
    }

    const canInsertSingle =
      candidate.status === "ready" && !this.actions.isBulkInserting();
    const canOperateCompletedCandidate =
      (candidate.status === "ready" || candidate.status === "inserted") &&
      !this.actions.isBulkInserting();
    const canCopyEmbed = canOperateCompletedCandidate && !!candidate.filePath;
    insertBtn.disabled = !canInsertSingle;
    regenerateBtn.disabled = !canOperateCompletedCandidate;
    copyPromptBtn.disabled = !candidate.sourcePrompt.trim();
    discardBtn.disabled = !canOperateCompletedCandidate;
    copyPathBtn.disabled = !canCopyEmbed;

    const markVisible = (): void => card.addClass("is-actions-visible");
    [
      insertBtn,
      regenerateBtn,
      copyPromptBtn,
      discardBtn,
      copyPathBtn,
    ].forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        markVisible();
      });
    });

    insertBtn.addEventListener("click", () => {
      void this.actions.onInsert(candidate.taskId);
    });
    regenerateBtn.addEventListener("click", () => {
      void this.actions.onRegenerate(candidate.taskId);
    });
    copyPromptBtn.addEventListener("click", () => {
      void this.actions.onCopyPrompt(candidate.taskId);
    });
    discardBtn.addEventListener("click", () => {
      void this.actions.onDiscard(candidate.taskId);
    });
    copyPathBtn.addEventListener("click", () => {
      void this.actions.onCopyEmbed(candidate.taskId);
    });

    this.renderCandidateMeta(card, candidate);
  }

  public getCandidatePreviewSrc(
    candidate: SidebarImageCandidate,
  ): string | null {
    if (candidate.imageDataUrl) {
      return candidate.imageDataUrl;
    }
    const filePath = candidate.filePath || "";
    if (!filePath) return null;
    try {
      const normalized = filePath.replace(/^\/+/, "");
      const fromAdapter = this.app.vault.adapter.getResourcePath(normalized);
      if (fromAdapter) {
        return fromAdapter;
      }
    } catch (error) {
      console.warn(
        "Sidebar CoPilot: failed to resolve preview via adapter",
        error,
      );
    }

    const abstract = this.app.vault.getAbstractFileByPath(filePath);
    if (!(abstract instanceof TFile)) {
      return null;
    }
    return this.app.vault.getResourcePath(abstract);
  }

  private renderCandidateMeta(
    card: HTMLElement,
    candidate: SidebarImageCandidate,
  ): void {
    const meta = card.createDiv("sidebar-image-candidate-meta");
    const title = meta.createDiv({
      cls: "sidebar-image-candidate-prompt",
      text: candidate.sourcePrompt.trim() || this.tr("无提示词", "No prompt"),
    });
    title.setAttr("title", candidate.sourcePrompt);

    const detail = meta.createDiv("sidebar-image-candidate-detail");
    const refs = candidate.sourceInputImages.length;
    const duration =
      candidate.durationMs && candidate.durationMs > 0
        ? this.formatDuration(candidate.durationMs)
        : this.formatClockTime(candidate.createdAt);
    detail.createSpan({
      text: `#${candidate.sequence}`,
    });
    detail.createSpan({
      text: this.tr(`参考 ${refs}`, `${refs} ref${refs === 1 ? "" : "s"}`),
    });
    detail.createSpan({
      text: duration,
    });
  }

  private formatDuration(durationMs: number): string {
    const seconds = Math.max(1, Math.round(durationMs / 1000));
    if (seconds < 60) {
      return this.tr(`${seconds} 秒`, `${seconds}s`);
    }
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return this.tr(`${minutes}分${rest}秒`, `${minutes}m ${rest}s`);
  }

  private formatClockTime(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  private openCandidatePreviewModal(
    candidate: SidebarImageCandidate,
    previewSrc: string,
  ): void {
    const modal = new ReferenceImagePreviewModal(
      this.app,
      previewSrc,
      candidate.fileName,
      {
        downloadText: this.tr("下载图片到本地", "Download Image"),
        insertText: this.tr("插入到笔记", "Insert into Note"),
        onDownload: () => this.downloadCandidateImage(candidate, previewSrc),
        onInsert: () => {
          void this.actions.onInsert(candidate.taskId);
        },
      },
    );
    modal.open();
  }

  private downloadCandidateImage(
    candidate: SidebarImageCandidate,
    previewSrc: string,
  ): void {
    try {
      const link = document.createElement("a");
      link.href = previewSrc;
      link.download = candidate.fileName || `ai-generated-${Date.now()}.png`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      new Notice(this.tr("已开始下载图片", "Image download started"));
    } catch (error) {
      console.error("Sidebar CoPilot: failed to download candidate image", error);
      new Notice(
        this.tr("下载失败，请重试", "Download failed. Please retry."),
      );
    }
  }
}
