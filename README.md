<div align="center">
  <img src="public/lingxi-icon-concept.png" width="120" alt="Lingxi icon" />
  <h1>Lingxi</h1>
  <p><b>在 Obsidian 里完成 Prompt、生图、候选图筛选与笔记插入。</b></p>
  <a href="https://github.com/Zanetach/Lingxi/stargazers"><img src="https://img.shields.io/github/stars/Zanetach/Lingxi?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/Zanetach/Lingxi/releases"><img src="https://img.shields.io/github/v/tag/Zanetach/Lingxi?label=version&style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://obsidian.md"><img src="https://img.shields.io/badge/Obsidian-1.8%2B-7c3aed?style=flat-square" alt="Obsidian"></a>
</div>

## Why

Lingxi（灵犀）是一个 Obsidian 侧边栏生图工作台。它解决的不是“能不能调用一次图片 API”，而是把真实写作里的视觉流程留在笔记环境中：读当前笔记、整理 Prompt、生成多张候选图、比较结果、重生不满意的图，最后把选中的图片插回 Markdown。

很多生图工具停在聊天窗口或网页表单里，图片和笔记会分散在不同地方。Lingxi 把这条链路收束到 Obsidian：Prompt 来自笔记，图片存进 vault，插入语法自动生成，候选图也保留可追溯的提示词和模型信息。

## See it

![Lingxi README hero](public/lingxi-readme-hero.png)

<table>
<tr>
  <td align="center" width="25%">
    <b>Prompt 工作台</b>
    <br><sub>输入、优化、复用当前笔记上下文</sub>
  </td>
  <td align="center" width="25%">
    <b>候选图筛选</b>
    <br><sub>多图比较、插入、重生、丢弃</sub>
  </td>
  <td align="center" width="25%">
    <b>图生图</b>
    <br><sub>上传参考图或读取笔记内图片</sub>
  </td>
  <td align="center" width="25%">
    <b>本地文件闭环</b>
    <br><sub>生成图片保存到 vault 并写回 Markdown</sub>
  </td>
</tr>
</table>

## Features

| 能力 | 说明 |
|---|---|
| 文生图 | 输入 Prompt，生成 1 到 9 张候选图 |
| 图生图 | 上传本地参考图，或从当前笔记选择已有图片作为参考 |
| 笔记上下文 | 使用 `@current_note`、`{{current_note}}`、`@当前笔记` 注入当前 Markdown 内容 |
| 候选图工作流 | 支持插入、重生、丢弃、复制提示词、复制 Obsidian 嵌入语法 |
| 批量任务 | 支持并发队列、取消任务、失败重试和一键插入已完成候选图 |
| 多页视觉 | 可把 PPT / 分页视觉需求拆成多个稳定的生成任务 |
| Provider 切换 | 支持 OpenAI、Gemini、OpenRouter 和 Codex CLI |

## Providers

| Provider | 文生图 | 图生图 | 适合场景 |
|---|---:|---:|---|
| OpenAI API | Yes | Yes | 需要稳定图片质量和原生图片接口 |
| Gemini API | Yes | Yes | 需要用 `inlineData` 传入参考图 |
| OpenRouter | Yes | Model-dependent | 想按模型市场灵活切换 |
| Codex CLI | Yes | Yes | 想让本机 Codex agent 在 vault 内生成真实图片文件 |

Codex CLI 不是原生图片 API。它会启动 `codex exec`，等待模型完成推理，再从输出中解析 base64、图片路径、`file://` URL 或 Markdown 图片链接。速度通常慢于 OpenAI/Gemini，但适合本机 agent 工作流和可审计的文件生成。

## Usage

**Release 安装**

1. 下载 Release 包。
2. 解压到你的 Obsidian vault：

```text
.obsidian/plugins/lingxi/
```

3. 重启 Obsidian。
4. 在 `设置 -> 第三方插件` 中启用 `Lingxi`。

**本地开发安装**

```bash
npm install
npm run build
bash scripts/deploy-dev.sh /path/to/your/vault
```

**基础流程**

1. 打开一篇 Markdown 笔记。
2. 点击 Obsidian 左侧 Lingxi 图标，打开右侧工作台。
3. 在设置中选择 OpenAI、Gemini、OpenRouter 或 Codex CLI。
4. 输入 Prompt，或用 `@current_note` 引用当前笔记。
5. 如需图生图，打开图生图开关并添加参考图。
6. 选择模型、比例、分辨率和候选图数量。
7. 点击生成，在候选图区域比较结果。
8. 插入满意图片，或对单张候选图执行重生、丢弃、复制提示词。

## Prompts

**从当前笔记生成封面**

```text
@current_note
生成一张适合这篇笔记的封面图。画面要清晰、有主题感，不要出现文字。
```

**用参考图做图生图**

```text
保留参考图的主体、构图和人物身份，只增强光影、材质细节和整体视觉质感。
输出应清晰、自然、适合作为笔记插图。
```

**拆分多页视觉**

```text
基于 @current_note 做 6 页 PPT 视觉，每页生成一张可作为幻灯片背景的图片。
```

点击 `优化` 后，Lingxi 会把多页需求拆成更稳定的分页提示词。

## Codex CLI

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

Lingxi 会读取结果并校验 PNG/JPEG/WebP/GIF 文件头，避免把伪图片或空文件加入候选图。图生图会通过 `codex exec --image <file> -- <prompt>` 传入参考图，其中 `--` 用来确保 Prompt 不会被 CLI 当作图片参数吞掉。

## Settings

| 设置项 | 说明 |
|---|---|
| API Provider | 选择 OpenRouter、OpenAI、Gemini 或 Codex CLI |
| Image generation model | 当前 Provider 的图片模型 |
| Quick switch image models | 常用图片模型快捷切换 |
| Image save location | vault 内图片保存目录 |
| Image compression quality | 读取参考图时的压缩质量 |
| Image max size | 参考图最大边长 |
| Image system prompt | 生图系统提示词 |
| Image Generation Timeout | 生图超时时间 |
| Codex command / arguments / working directory | Codex CLI 桥接配置 |

## Design

Lingxi 的交互原则是“候选图优先，Prompt 不打断创作”。候选图区域负责展示结果和后续动作，Prompt 区放在下方用于继续微调；视觉主题尽量跟随 Obsidian 变量，不写死成独立应用的颜色系统。

| Element | Rule |
|---|---|
| Canvas | 跟随 Obsidian 背景、边框和文本变量 |
| Prompt | 保持可编辑、可复用，不把优化结果藏进不可见状态 |
| Candidates | 缩略图必须清晰，状态、耗时、插入结果可见 |
| Actions | 插入、重生、丢弃、复制提示词是候选图的一等操作 |
| Assets | 图片写入 vault，可被 Markdown、Obsidian 和同步工具直接管理 |

## Development

```bash
npm install
npm run build
npm run lint
npm test
```

当前测试覆盖：

- Codex CLI 图片附件参数构造
- 图片文件头识别与伪图片拒绝
- Gemini、OpenAI、Codex 模型目录过滤
- 生图错误归一与建议文案
- `@current_note` 与 PPT 自动拆页提示词工具
- Obsidian / Markdown 图片引用解析

## FAQ

**为什么 Codex CLI 生图比较慢？**

Codex CLI 每次都要启动 `codex exec`，再经过模型推理、文件写入和结果解析。Lingxi 已默认使用低推理参数、禁用审批等待，并通过 `--output-last-message` 读取最终结果，但复杂图生图仍可能明显慢于 OpenAI/Gemini 原生图片 API。

**为什么候选图没有显示？**

常见原因包括 Provider 没有返回真实图片、模型不支持图片输出、Codex 返回说明文字而不是图片路径、返回文件不是有效图片，或图片保存路径不在当前 vault 内。

**为什么生成按钮不可用？**

常见原因包括提示词为空、图生图已开启但没有参考图、当前正在生成，或当前 Provider 未配置 API Key / Codex 命令。

## English

Lingxi is an Obsidian sidebar image studio for prompt-driven generation, reference-image workflows, candidate comparison, regeneration, and Markdown insertion. It keeps prompts, generated files, and selected images inside your vault instead of scattering them across external chats or web tools.

## License

MIT License. See [LICENSE](LICENSE).
