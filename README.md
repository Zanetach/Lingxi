# Lingxi

> Obsidian sidebar image studio for prompt-driven image generation, reference-image generation, candidate comparison, regeneration, and note insertion.

Lingxi keeps the image workflow inside Obsidian. Open a note, write or inject a prompt, generate candidates, compare results, regenerate the weak ones, and insert the selected image back into the active Markdown file.

![Lingxi README hero](public/lingxi-readme-hero.png)

[简体中文](#简体中文) | [English](#english)

---

## 简体中文

### 这是什么

Lingxi 是一个面向 Obsidian 的交互式生图工作台。它不是单次 API 调用面板，而是围绕「笔记上下文 -> Prompt -> 候选图 -> 插入笔记」设计的侧边栏工作流。

| 能力 | 说明 |
| --- | --- |
| 文生图 | 输入 Prompt，生成 1 到 9 张候选图 |
| 图生图 | 上传本地参考图，或从当前笔记选择已有图片作为参考 |
| 笔记上下文 | 使用 `@current_note`、`{{current_note}}`、`@当前笔记` 注入当前笔记内容 |
| 候选图工作流 | 支持插入、重生、丢弃、复制提示词、复制 Obsidian 嵌入语法 |
| 批量生成 | 支持并发队列、取消任务、失败重试和一键插入已完成候选图 |
| PPT 分页视觉 | 可把多页视觉需求拆成多个生成任务 |

### 支持的 Provider

| Provider | 文生图 | 图生图 | 说明 |
| --- | --- | --- | --- |
| OpenAI API | 支持 | 支持 | 通过原生图片接口传入 Prompt 和参考图 |
| Gemini API | 支持 | 支持 | 通过 `inlineData` 传入参考图 |
| OpenRouter | 支持 | 取决于模型 | 需要选择支持图片输入/输出的模型 |
| Codex CLI | 支持 | 支持 | 通过 `codex exec --image` 传入参考图，并在 vault 图片目录生成真实图片文件 |

Codex CLI 适合本机 agent 工作流，但它不是原生图片 API。复杂图生图会比 OpenAI/Gemini 慢，速度取决于 Codex 后端模型、网络和本机 CLI 启动耗时。

### 交互流程

1. 打开一篇 Markdown 笔记。
2. 点击 Obsidian 左侧 Lingxi 图标，打开右侧生图工作台。
3. 在设置中选择 Provider，并配置 OpenAI、Gemini、OpenRouter API Key 或 Codex CLI。
4. 输入 Prompt，或用 `@current_note` 引用当前笔记。
5. 按需打开 `图生图`，上传参考图或从当前笔记选择图片。
6. 设置模型、比例、分辨率和生成张数。
7. 点击 `生成`，在候选图区域比较结果。
8. 对单张候选图执行 `插入`、`重生`、`丢弃`、`复制提示词` 或 `复制嵌入语法`。

### 推荐用法

#### 从当前笔记生成配图

```text
@current_note
生成一张适合这篇笔记的封面图。画面要清晰、有主题感，不要出现文字。
```

#### 用参考图做图生图

```text
保留参考图的主体、构图和人物身份，只增强光影、材质细节和整体视觉质感。
输出应清晰、自然、适合作为笔记插图。
```

#### 生成多页视觉

```text
基于 @current_note 做 6 页 PPT 视觉，每页生成一张可作为幻灯片背景的图片。
```

点击 `优化` 后，Lingxi 会把多页需求拆成更稳定的分页提示词。

### Codex CLI

默认参数：

```bash
exec --skip-git-repo-check --sandbox workspace-write --ask-for-approval never --ephemeral --ignore-rules -c 'model_reasoning_effort="low"'
```

当 `Codex 工作目录` 为空时，Lingxi 会自动把 Codex 工作目录指向 vault 内的图片保存目录，默认是：

```text
Assets/AI
```

Codex CLI 生图必须返回以下任一结果：

- `data:image/...;base64,...`
- 本地图片绝对路径
- `file://` 图片 URL
- Markdown 图片链接

Lingxi 会读取结果并校验 PNG/JPEG/WebP/GIF 文件头，避免把伪图片或空文件加入候选图。

### 设置项

| 设置项 | 说明 |
| --- | --- |
| API Provider | 选择 OpenRouter、OpenAI、Gemini 或 Codex CLI |
| Image generation model | 当前 Provider 的图片模型 |
| Quick switch image models | 常用图片模型快捷切换 |
| Image save location | vault 内图片保存目录 |
| Image compression quality | 读取参考图时的压缩质量 |
| Image max size | 参考图最大边长 |
| Image system prompt | 生图系统提示词 |
| Image Generation Timeout | 生图超时时间 |
| Codex command / arguments / working directory | Codex CLI 桥接配置 |

### 安装

#### Release 安装

1. 下载 Release 包。
2. 解压到你的 vault：

```text
.obsidian/plugins/lingxi/
```

3. 重启 Obsidian。
4. 在 `设置 -> 第三方插件` 中启用 `Lingxi`。

#### 本地开发安装

```bash
npm install
npm run build
bash scripts/deploy-dev.sh /path/to/your/vault
```

### 开发

```bash
npm install
npm run build
npm run lint
npm test
```

当前测试覆盖：

- Codex CLI 图片附件参数构造
- 图片文件头识别与伪图片拒绝
- Gemini/OpenAI/Codex 模型目录过滤
- 生图错误归一与建议文案
- `@current_note` 与 PPT 自动拆页提示词工具
- Obsidian / Markdown 图片引用解析

### 常见问题

#### 为什么 Codex CLI 生图比较慢？

Codex CLI 每次都要启动 `codex exec`，再经过模型推理、文件写入和结果解析。Lingxi 已默认使用低推理参数、禁用审批等待，并通过 `--output-last-message` 读取最终结果，但复杂图生图仍可能明显慢于 OpenAI/Gemini 原生图片 API。

#### 为什么候选图没有显示？

常见原因包括 Provider 没有返回真实图片、模型不支持图片输出、Codex 返回说明文字而不是图片路径、返回文件不是有效图片，或图片保存路径不在当前 vault 内。

#### 为什么生成按钮不可用？

常见原因包括提示词为空、图生图已开启但没有参考图、当前正在生成，或当前 Provider 未配置 API Key / Codex 命令。

### License

MIT, see [LICENSE](LICENSE).

---

## English

### What It Is

Lingxi is an interactive image-generation workbench for Obsidian. It is built around a sidebar workflow: note context, prompt, reference images, generated candidates, regeneration, and Markdown insertion.

### Core Workflow

1. Open a Markdown note.
2. Click the Lingxi ribbon icon to open the sidebar.
3. Configure OpenAI, Gemini, OpenRouter, or Codex CLI.
4. Write a prompt, or inject note context with `@current_note`.
5. Optionally enable Image-to-Image and add a reference image from local files or the current note.
6. Choose model, aspect ratio, resolution, and candidate count.
7. Generate candidates, compare them, regenerate weak results, and insert the selected image into the note.

### Provider Support

| Provider | Text-to-Image | Image-to-Image | Notes |
| --- | --- | --- | --- |
| OpenAI API | Yes | Yes | Uses native image APIs with reference image data URLs |
| Gemini API | Yes | Yes | Sends references through `inlineData` |
| OpenRouter | Yes | Model-dependent | Requires a model with image input/output support |
| Codex CLI | Yes | Yes | Passes references through `codex exec --image` and expects a real local image result |

Codex CLI is useful for local agent-driven workflows, but it is not a native image API. For speed and image fidelity, OpenAI or Gemini image models are usually better.

### Development

```bash
npm install
npm run build
npm run lint
npm test
```

### License

MIT, see [LICENSE](LICENSE).
