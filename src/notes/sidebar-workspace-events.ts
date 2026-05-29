import { Editor, ItemView, MarkdownView, Menu } from "obsidian";
import type CanvasAIPlugin from "../../main";

type Translator = (zh: string, en: string) => string;

export interface SidebarWorkspaceCallbacks {
  clearCapturedContext: () => void;
  getPromptValue: () => string;
  setInputPromptValue: (
    prompt: string,
    options?: { persist?: boolean; updateState?: boolean },
  ) => void;
}

export function registerSidebarWorkspaceEvents(
  owner: ItemView,
  plugin: CanvasAIPlugin,
  tr: Translator,
  callbacks: SidebarWorkspaceCallbacks,
): void {
  owner.registerEvent(
    owner.app.workspace.on("active-leaf-change", (leaf) => {
      const file = owner.app.workspace.getActiveFile();
      if (file?.extension !== "md") callbacks.clearCapturedContext();
      if (leaf?.view === owner) {
        tryAutoFillFromSelection(plugin, callbacks);
      }
    }),
  );
  owner.registerEvent(
    owner.app.workspace.on(
      "editor-menu",
      (menu: Menu, editor: Editor, _view: MarkdownView) => {
        const selection = editor.getSelection();
        if (!selection?.trim()) return;
        menu.addItem((item) => {
          item
            .setTitle(tr("以选中文字生成图片", "Generate image from selection"))
            .setIcon("image")
            .onClick(() => {
              callbacks.setInputPromptValue(selection.trim(), {
                persist: false,
                updateState: true,
              });
              void owner.app.workspace.revealLeaf(owner.leaf);
            });
        });
      },
    ),
  );
}

function tryAutoFillFromSelection(
  plugin: CanvasAIPlugin,
  callbacks: SidebarWorkspaceCallbacks,
): void {
  if (callbacks.getPromptValue().trim()) return;
  const notesHandler = plugin.getNotesHandler();
  if (!notesHandler) return;
  const context = notesHandler.captureSelectionForSidebar();
  if (context?.selectedText?.trim()) {
    callbacks.setInputPromptValue(context.selectedText.trim(), {
      persist: false,
      updateState: true,
    });
  }
}
