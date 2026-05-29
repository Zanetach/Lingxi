import { App, Menu, Notice, TFile } from "obsidian";
import type { NotesSelectionContext } from "./notes-selection-handler";
import type { SidebarInputImage } from "./sidebar-candidate-types";
import {
  NoteImagePickerModal,
  ReferenceImagePreviewModal,
} from "./sidebar-modals";
import type { NoteImageOption } from "./sidebar-modals";
import {
  encodeBytesToBase64,
  extractImageRefsFromContent,
  getMimeTypeByFileName,
  isImageFile,
  readFileAsDataUrl,
  resolveCandidateImagePath,
} from "./sidebar-reference-image-utils";

type Translator = (zh: string, en: string) => string;
type PrimaryReferenceSource = "uploaded" | "note";

export interface SidebarReferenceElements {
  imageToImageToggleBtn: HTMLButtonElement;
  imageToImageStateEl: HTMLElement;
  imageToImagePanelEl: HTMLElement;
  imageToImageUploadBtn: HTMLButtonElement;
  imageToImageClearBtn: HTMLButtonElement;
  imageToImageFileInput: HTMLInputElement;
  imageToImagePreviewWrapEl: HTMLElement;
  imageToImagePreviewEl: HTMLImageElement;
  imageToImageFileNameEl: HTMLElement;
}

export interface SidebarReferenceCallbacks {
  getCapturedContext: () => NotesSelectionContext | null;
  syncReferenceImageNameToPrompt: (fileName: string | null) => void;
  updateGenerateButtonState: () => void;
}

export class SidebarReferenceController {
  private app: App;
  private elements: SidebarReferenceElements;
  private tr: Translator;
  private callbacks: SidebarReferenceCallbacks;
  private isImageToImageEnabled = false;
  private uploadedReferenceImage: SidebarInputImage | null = null;
  private selectedReferenceImages: SidebarInputImage[] = [];
  private primaryReferenceSource: PrimaryReferenceSource | null = null;
  private referencePreviewObjectUrl: string | null = null;

  constructor(
    app: App,
    elements: SidebarReferenceElements,
    tr: Translator,
    callbacks: SidebarReferenceCallbacks,
  ) {
    this.app = app;
    this.elements = elements;
    this.tr = tr;
    this.callbacks = callbacks;
  }

  public destroy(): void {
    this.setReferencePreviewObjectUrl(null);
  }

  public setMode(enabled: boolean): void {
    this.isImageToImageEnabled = enabled;
    this.updateControls();
    this.callbacks.updateGenerateButtonState();
  }

  public isEnabled(): boolean {
    return this.isImageToImageEnabled;
  }

  public getExplicitReferenceCount(): number {
    return (
      (this.uploadedReferenceImage ? 1 : 0) +
      this.selectedReferenceImages.length
    );
  }

  public getInputImages(): SidebarInputImage[] {
    return this.isImageToImageEnabled
      ? [
          ...(this.uploadedReferenceImage ? [this.uploadedReferenceImage] : []),
          ...this.selectedReferenceImages,
        ]
      : [];
  }

  public getPrimaryReferenceName(): string | null {
    if (
      this.primaryReferenceSource === "note" &&
      this.selectedReferenceImages[0]?.fileName
    ) {
      return this.selectedReferenceImages[0].fileName;
    }
    if (
      this.primaryReferenceSource === "uploaded" &&
      this.uploadedReferenceImage?.fileName
    ) {
      return this.uploadedReferenceImage.fileName;
    }
    return (
      this.selectedReferenceImages[0]?.fileName ||
      this.uploadedReferenceImage?.fileName ||
      null
    );
  }

  public updateControls(): void {
    const {
      imageToImageToggleBtn,
      imageToImageStateEl,
      imageToImagePanelEl,
      imageToImagePreviewWrapEl,
      imageToImageFileNameEl,
      imageToImageClearBtn,
      imageToImageUploadBtn,
    } = this.elements;

    imageToImageToggleBtn.toggleClass("is-active", this.isImageToImageEnabled);
    imageToImageToggleBtn.setAttr(
      "aria-pressed",
      this.isImageToImageEnabled ? "true" : "false",
    );
    imageToImageStateEl.textContent = this.isImageToImageEnabled
      ? this.tr("开", "On")
      : this.tr("关", "Off");
    imageToImageStateEl.toggleClass("is-active", this.isImageToImageEnabled);
    imageToImagePanelEl.toggleClass("is-hidden", !this.isImageToImageEnabled);

    const uploadedIsPrimary = this.isUploadedReferencePrimary();
    const fileName =
      this.getPrimaryReferenceName() ||
      this.tr("未选择图片", "No image selected");
    imageToImageFileNameEl.textContent = fileName;
    imageToImageFileNameEl.toggleClass(
      "has-file",
      Boolean(this.getPrimaryReferenceName()),
    );
    imageToImagePreviewWrapEl.toggleClass(
      "has-file",
      Boolean(
        uploadedIsPrimary &&
          this.uploadedReferenceImage &&
          this.referencePreviewObjectUrl,
      ),
    );
    imageToImagePreviewWrapEl.toggleClass(
      "is-disabled",
      imageToImageUploadBtn.disabled,
    );
    imageToImagePreviewWrapEl.setAttr(
      "title",
      uploadedIsPrimary && this.uploadedReferenceImage
        ? this.tr(
            "点击查看大图，也可拖拽替换",
            "Click to preview, or drag to replace",
          )
        : this.tr(
            "点击或拖拽上传参考图",
            "Click or drag to upload a reference image",
          ),
    );
    imageToImageClearBtn.disabled =
      !this.uploadedReferenceImage && this.selectedReferenceImages.length === 0;
  }

  public async handleReferenceImageFileChange(): Promise<void> {
    const file = this.elements.imageToImageFileInput.files?.[0];
    if (file) await this.processReferenceImageFile(file);
  }

  public canAcceptReferenceImageDrop(): boolean {
    return Boolean(
      this.isImageToImageEnabled &&
        !this.elements.imageToImagePanelEl.hasClass("is-hidden") &&
        !this.elements.imageToImageUploadBtn.disabled,
    );
  }

  public async processReferenceImageFile(file: File): Promise<void> {
    if (!isImageFile(file)) {
      new Notice(this.tr("仅支持图片文件", "Only image files are supported"));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (!match) throw new Error("invalid_image_data");
      this.uploadedReferenceImage = {
        base64: match[2],
        mimeType: match[1] || file.type || "image/png",
        role: "reference",
        fileName: file.name,
      };
      this.primaryReferenceSource = "uploaded";
      this.setReferencePreviewObjectUrl(URL.createObjectURL(file));
      this.syncAfterReferenceChange();
      new Notice(this.tr("已加载参考图", "Reference image loaded"));
    } catch (error) {
      console.error("Sidebar CoPilot: failed to read reference image", error);
      this.clearReferenceImage();
      this.callbacks.updateGenerateButtonState();
      new Notice(
        this.tr(
          "参考图读取失败，请重试",
          "Failed to read reference image, please retry",
        ),
      );
    }
  }

  public clearAllReferenceImages(): void {
    this.selectedReferenceImages = [];
    this.primaryReferenceSource = null;
    this.clearReferenceImage();
  }

  public handleReferencePreviewClick(): void {
    if (this.referencePreviewObjectUrl && this.uploadedReferenceImage) {
      new ReferenceImagePreviewModal(
        this.app,
        this.referencePreviewObjectUrl,
        this.uploadedReferenceImage.fileName,
      ).open();
      return;
    }
    if (!this.elements.imageToImageUploadBtn.disabled) {
      this.elements.imageToImageFileInput.value = "";
      this.elements.imageToImageFileInput.click();
    }
  }

  public openAddReferenceMenu(event: MouseEvent): void {
    if (!this.isImageToImageEnabled) this.setMode(true);
    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle(this.tr("从本地上传", "Upload from Local"))
        .setIcon("upload")
        .onClick(() => {
          this.elements.imageToImageFileInput.value = "";
          this.elements.imageToImageFileInput.click();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(this.tr("从当前笔记选择", "Select from Current Note"))
        .setIcon("image-file")
        .onClick(() => {
          void this.openNoteImagePicker();
        });
    });
    menu.showAtMouseEvent(event);
  }

  private clearReferenceImage(): void {
    const shouldFallbackToNote =
      this.primaryReferenceSource === "uploaded" &&
      this.selectedReferenceImages.length > 0;
    this.uploadedReferenceImage = null;
    this.elements.imageToImageFileInput.value = "";
    this.primaryReferenceSource = shouldFallbackToNote ? "note" : null;
    this.setReferencePreviewObjectUrl(null);
    this.syncAfterReferenceChange();
  }

  private async openNoteImagePicker(): Promise<void> {
    const options = await this.collectCurrentNoteImageOptions();
    const preselected = new Set(
      this.selectedReferenceImages
        .map((item) => item.sourcePath || "")
        .filter(Boolean),
    );
    new NoteImagePickerModal(this.app, options, preselected, (paths) => {
      void this.applySelectedNoteImages(paths);
    }).open();
  }

  private isUploadedReferencePrimary(): boolean {
    if (!this.uploadedReferenceImage) return false;
    if (this.primaryReferenceSource === "note") return false;
    return true;
  }

  private async applySelectedNoteImages(paths: string[]): Promise<void> {
    const next: SidebarInputImage[] = [];
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      try {
        const data = await this.app.vault.readBinary(file);
        next.push({
          base64: encodeBytesToBase64(new Uint8Array(data)),
          mimeType: getMimeTypeByFileName(file.name),
          role: "reference",
          fileName: file.name,
          sourcePath: file.path,
        });
      } catch (error) {
        console.warn("Sidebar CoPilot: failed to read note image", path, error);
      }
    }
    this.selectedReferenceImages = next;
    if (next.length > 0) {
      this.uploadedReferenceImage = null;
      this.elements.imageToImageFileInput.value = "";
      this.setReferencePreviewObjectUrl(null);
      this.primaryReferenceSource = "note";
    } else if (!this.uploadedReferenceImage) {
      this.primaryReferenceSource = null;
    }
    this.syncAfterReferenceChange();
    if (next.length > 0) {
      new Notice(
        this.tr(
          `已选择 ${next.length} 张参考图`,
          `${next.length} reference image(s) selected`,
        ),
      );
    }
  }

  private async collectCurrentNoteImageOptions(): Promise<NoteImageOption[]> {
    const file =
      this.app.workspace.getActiveFile() ||
      this.callbacks.getCapturedContext()?.file;
    if (!file || file.extension !== "md") {
      new Notice(
        this.tr(
          "请先激活一个 Markdown 笔记",
          "Please activate a Markdown note first",
        ),
      );
      return [];
    }
    const content = await this.app.vault.read(file);
    const refs = extractImageRefsFromContent(content);
    const unique = new Set<string>();
    const results: NoteImageOption[] = [];
    for (const rawPath of refs) {
      const resolved = resolveCandidateImagePath(this.app, file.path, rawPath);
      if (!resolved || unique.has(resolved)) continue;
      const abstract = this.app.vault.getAbstractFileByPath(resolved);
      if (!(abstract instanceof TFile)) continue;
      unique.add(resolved);
      results.push({
        path: resolved,
        fileName: abstract.name,
        previewSrc: this.app.vault.getResourcePath(abstract),
      });
    }
    return results;
  }

  private setReferencePreviewObjectUrl(nextUrl: string | null): void {
    if (this.referencePreviewObjectUrl) {
      URL.revokeObjectURL(this.referencePreviewObjectUrl);
    }
    this.referencePreviewObjectUrl = nextUrl;
    if (nextUrl) {
      this.elements.imageToImagePreviewEl.src = nextUrl;
      return;
    }
    this.elements.imageToImagePreviewEl.removeAttribute("src");
  }

  private syncAfterReferenceChange(): void {
    this.callbacks.syncReferenceImageNameToPrompt(this.getPrimaryReferenceName());
    this.updateControls();
    this.callbacks.updateGenerateButtonState();
  }
}
