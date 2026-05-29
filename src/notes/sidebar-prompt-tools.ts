import type { NotesSelectionContext } from "./notes-selection-handler";
import type { SidebarInputImage } from "./sidebar-candidate-types";
import type { GenerationQueueTask } from "./sidebar-generation-queue";

type Translator = (zh: string, en: string) => string;

export interface CurrentNoteInjectionResult {
  prompt: string;
  replaced: boolean;
}

export interface CurrentNoteMeta {
  basename: string;
  path: string;
}

export class SidebarPromptTools {
  public readonly referencePromptPrefix = "[参考图] ";
  public readonly pptAutoMarker = "[PPT_AUTO]";
  public readonly pptAutoLegacyMarker = "[PPT_AUTO_8]";

  private readonly currentNotePlaceholderTokens = ["@current_note", "{{current_note}}", "@当前笔记"];
  private readonly currentNoteShortcutPattern =
    /(^|[\s,，。；;])@(?=$|[\s,，。；;])/g;
  private readonly currentNoteTokenPattern = /@current_note(?:\([^)]+\))?/g;

  private readonly tr: Translator;
  private readonly getActiveMarkdownBasename: () => string;
  private readonly getDefaultAspectRatio: () => string;

  constructor(
    tr: Translator,
    getActiveMarkdownBasename: () => string,
    getDefaultAspectRatio: () => string,
  ) {
    this.tr = tr;
    this.getActiveMarkdownBasename = getActiveMarkdownBasename;
    this.getDefaultAspectRatio = getDefaultAspectRatio;
  }

  public hasCurrentNotePlaceholder(prompt: string): boolean {
    if (!prompt) return false;
    this.currentNoteShortcutPattern.lastIndex = 0;
    if (this.currentNoteShortcutPattern.test(prompt)) {
      this.currentNoteShortcutPattern.lastIndex = 0;
      return true;
    }
    this.currentNoteShortcutPattern.lastIndex = 0;
    this.currentNoteTokenPattern.lastIndex = 0;
    if (this.currentNoteTokenPattern.test(prompt)) {
      this.currentNoteTokenPattern.lastIndex = 0;
      return true;
    }
    this.currentNoteTokenPattern.lastIndex = 0;
    return this.currentNotePlaceholderTokens.some((token) =>
      prompt.includes(token),
    );
  }

  public normalizeCurrentNoteShortcut(prompt: string): string {
    if (!prompt) return prompt;
    const basename = this.getActiveMarkdownBasename();
    const replacement = basename ? `@current_note(${basename})` : "@current_note";
    this.currentNoteShortcutPattern.lastIndex = 0;
    const normalized = prompt.replace(
      this.currentNoteShortcutPattern,
      (_match, prefix: string) => `${prefix}${replacement}`,
    );
    return this.decorateCurrentNoteTokenWithName(normalized);
  }

  public composePromptWithReferenceLine(
    prompt: string,
    fileName: string | null,
  ): string {
    const lines = (prompt || "").split("\n");
    const bodyLines = lines.filter(
      (line) => !line.trimStart().startsWith(this.referencePromptPrefix),
    );
    if (!fileName) return bodyLines.join("\n");
    return [`${this.referencePromptPrefix}${fileName}`, ...bodyLines].join("\n");
  }

  public summarizeNoteForPrompt(content: string): string {
    const cleaned = this.collapseSpaces(this.stripMarkdownNoise(content));
    if (!cleaned) return "";

    const lines = cleaned
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => Boolean(line));
    const ranked: string[] = [];
    const headings = lines
      .filter((line) => /^#{1,4}\s+/.test(line))
      .slice(0, 8)
      .map((line) => line.replace(/^#{1,4}\s+/, ""));
    const bullets = lines
      .filter((line) => /^([-*]|\d+\.)\s+/.test(line))
      .slice(0, 12)
      .map((line) => line.replace(/^([-*]|\d+\.)\s+/, ""));
    const paragraphs = lines.filter(
      (line) => !/^#{1,4}\s+/.test(line) && !/^([-*]|\d+\.)\s+/.test(line),
    ).slice(0, 12);

    if (headings.length > 0) {
      ranked.push(this.tr("标题与章节：", "Headings and sections:"));
      headings.forEach((item) => ranked.push(`- ${item}`));
    }
    if (bullets.length > 0) {
      ranked.push(this.tr("关键要点：", "Key points:"));
      bullets.forEach((item) => ranked.push(`- ${item}`));
    }
    if (paragraphs.length > 0) {
      ranked.push(this.tr("正文摘要：", "Body summary:"));
      paragraphs.forEach((item) => ranked.push(`- ${item}`));
    }

    const merged = ranked.join("\n").trim() || cleaned.slice(0, 2000);
    const maxChars = 3200;
    return merged.length <= maxChars ? merged : `${merged.slice(0, maxChars)}\n...`;
  }

  public injectCurrentNoteSummary(
    prompt: string,
    note: CurrentNoteMeta,
    summary: string,
  ): CurrentNoteInjectionResult {
    const injectedBlock = [
      this.tr("[当前笔记上下文]", "[Current Note Context]"),
      `${this.tr("笔记名", "Note title")}: ${note.basename}`,
      `${this.tr("路径", "Path")}: ${note.path}`,
      this.tr(
        "以下是自动提取的笔记摘要，请基于它完成本次生图：",
        "Auto-extracted note summary for this generation:",
      ),
      summary,
    ].join("\n");

    let nextPrompt = prompt;
    this.currentNoteTokenPattern.lastIndex = 0;
    nextPrompt = nextPrompt.replace(this.currentNoteTokenPattern, injectedBlock);
    this.currentNoteTokenPattern.lastIndex = 0;
    this.currentNotePlaceholderTokens.forEach((token) => {
      nextPrompt = nextPrompt.split(token).join(injectedBlock);
    });
    return { prompt: nextPrompt, replaced: true };
  }

  public buildOptimizedImg2ImgPrompt(userPrompt: string): string {
    const text = userPrompt.replace(/\s+/g, " ").trim();
    const conflictTips = this.collectImageToImageConflictTips(text);
    const conflictSection =
      conflictTips.length > 0
        ? `${this.tr("冲突修正：", "Conflict fixes:")}\n- ${conflictTips.join("\n- ")}\n\n`
        : "";

    return [
      this.tr(
        "【图生图优化版（保真优先）】",
        "[Image-to-Image Optimized | Fidelity First]",
      ),
      this.tr(
        "必须以上传参考图为唯一视觉来源。",
        "Use the uploaded reference image as the only visual source.",
      ),
      this.tr(
        "先保留：人物身份、脸部结构、姿态与主体位置关系。",
        "Preserve first: identity, facial structure, pose, and subject composition.",
      ),
      this.tr(
        "再调整：材质特效、局部细节、氛围与光影。",
        "Then adjust: materials/effects, local details, atmosphere, and lighting.",
      ),
      this.tr(
        "禁止：替换人物、彻底重构场景、与参考图主体无关的改造。",
        "Do not: replace person, fully rebuild scene, or make unrelated transformations.",
      ),
      "",
      conflictSection + this.tr("用户目标效果：", "Target effect:"),
      text,
    ]
      .join("\n")
      .trim();
  }

  public buildOptimizedTextToImagePrompt(userPrompt: string): string {
    const text = userPrompt.replace(/\s+/g, " ").trim();
    return [
      this.tr("【文生图优化版】", "[Text-to-Image Optimized]"),
      this.tr(
        "请生成一张高质量、细节丰富、构图明确的图像。",
        "Generate a high-quality image with rich detail and clear composition.",
      ),
      this.tr(
        "输出要求：主体清晰、背景与主体关系明确、光线与色彩统一、材质细节可见。",
        "Requirements: clear subject, coherent background relation, consistent lighting/colors, visible material details.",
      ),
      this.tr("请避免无关元素和文字水印。", "Avoid irrelevant elements and text watermarks."),
      "",
      this.tr("用户需求：", "User request:"),
      text,
      "",
      this.tr("补充建议：", "Optional suggestions:"),
      this.tr("- 明确镜头与景别（近景/中景/远景）", "- Specify lens and shot size (close/mid/long shot)"),
      this.tr("- 明确光线方向与氛围", "- Specify lighting direction and mood"),
      this.tr("- 明确风格关键词（写实/电影感/插画等）", "- Specify style keywords (realistic/cinematic/illustration etc.)"),
    ].join("\n");
  }

  public isPptRequest(text: string): boolean {
    return Boolean(text) && /(ppt|幻灯|课件|演示文稿|投影片|简报)/i.test(text);
  }

  public buildOptimizedPptPrompt(userPrompt: string): string {
    const text = userPrompt.replace(/\s+/g, " ").trim();
    const pageCount = this.extractPptPageCountFromPrompt(text);
    const aspectRatio = this.extractPreferredAspectRatioFromPrompt(text);
    const withCurrentNote =
      this.hasCurrentNotePlaceholder(text) || text.includes("@current_note(")
        ? text
        : `@current_note\n${text}`;
    const styleSection = this.buildPptStyleSection(text);

    return [
      this.pptAutoMarker,
      this.tr(
        `【PPT 自动拆页模式】生成时将自动拆成 ${pageCount} 页任务；参数"张数"=每页候选数。`,
        `[PPT Auto Split Mode] Generation will split into ${pageCount} page tasks; Image Count = candidates per page.`,
      ),
      this.tr(
        "请严格沿用用户提示词中的受众、语气、目标与内容要求，不要擅自改写定位。",
        "Strictly preserve the audience, tone, goals, and content requirements from the user prompt; do not rewrite positioning.",
      ),
      "",
      ...styleSection,
      this.tr("【通用质量约束】", "[General Quality Constraints]"),
      this.tr(
        `一页一图（建议比例 ${aspectRatio}，若用户另有要求则以用户提示词为准），不要多页拼接长图；信息密度按用户提示词执行，缺省时保持版面充实且可读性优先。`,
        `One slide per image (recommended ratio ${aspectRatio}, but user prompt takes priority), no multi-page long collage; follow user-defined information density, and keep slides content-rich and readable when unspecified.`,
      ),
      "",
      this.tr("【内容来源】", "[Content Source]"),
      withCurrentNote,
      "",
      this.tr("【页级拆分策略】", "[Page Split Strategy]"),
      this.tr(
        `按 ${pageCount} 页拆分并逐页生成：先抽取用户提示词中的章节/主题；若未明确章节，再使用通用结构兜底。`,
        `Split into ${pageCount} slides and generate page by page: first extract sections/topics from the user prompt; use generic fallback only when sections are missing.`,
      ),
    ].join("\n");
  }

  public extractPptPageCountFromPrompt(prompt: string): number {
    const text = (prompt || "").replace(/\s+/g, " ");
    const patterns: RegExp[] = [
      /(?:共|总计|总共|需要|生成|做|制作)\s*(\d{1,2})\s*页/i,
      /(\d{1,2})\s*页(?:\s*(?:ppt|幻灯|课件|演示文稿|投影片|简报))?/i,
      /(?:slides?|pages?)\s*[:：]?\s*(\d{1,2})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (!m) continue;
      const value = Number.parseInt(m[1], 10);
      if (Number.isFinite(value) && value >= 1 && value <= 30) return value;
    }
    return 8;
  }

  public extractPreferredAspectRatioFromPrompt(prompt: string): string {
    const match = (prompt || "").match(/\b(1:1|16:9|9:16|4:3|3:4)\b/i);
    return match?.[1] || this.getDefaultAspectRatio() || "16:9";
  }

  public buildStrictImg2ImgPrompt(userPrompt: string): string {
    const withoutRefLine = this.composePromptWithReferenceLine(userPrompt, null);
    const cleaned = withoutRefLine.replace(
      /\bimage[_-]?\d+\.(png|jpe?g|webp|gif|bmp)\b/gi,
      this.tr("上传参考图", "uploaded reference image"),
    );
    const guard = [
      this.tr("【图生图强约束】", "[Image-to-Image Hard Constraints]"),
      this.tr(
        '你只能以"本次上传的参考图"作为唯一视觉参考来源。',
        'Use the "uploaded reference image in this task" as the only visual reference source.',
      ),
      this.tr(
        "忽略提示词中提到的其他图片文件名、历史图片或外部图片描述。",
        "Ignore any other image filenames, historical images, or external image descriptions in the prompt.",
      ),
      this.tr(
        "必须严格保留上传参考图的主体身份、构图关系与关键视觉特征，再按用户要求做风格/细节变化。",
        "Strictly preserve identity, composition, and key visual features from the uploaded reference before applying style/detail changes.",
      ),
      this.tr("不要替换为其他人物或其他参考来源。", "Do not replace with other people or reference sources."),
    ].join("\n");
    return `${guard}\n\n${this.tr("用户需求：", "User request:")}\n${cleaned}`;
  }

  public buildPptAutoGenerationTasks(
    prompt: string,
    context: NotesSelectionContext | null,
    pageCount: number,
    perPageCandidates: number,
    inputImages: SidebarInputImage[] = [],
  ): GenerationQueueTask[] {
    const safePageCount = Math.min(30, Math.max(1, pageCount));
    const safePerPage = Math.min(9, Math.max(1, perPageCandidates));
    const totalTasks = safePageCount * safePerPage;
    const fallbackPages = Array.from({ length: safePageCount }, (_, i) =>
      this.getFallbackPptPageTitle(i),
    );
    const rawBasePrompt = prompt
      .split("\n")
      .filter(
        (line) =>
          !line.includes(this.pptAutoMarker) &&
          !line.includes(this.pptAutoLegacyMarker),
      )
      .join("\n")
      .trim();
    const basePrompt = this.compactPptPromptForTaskCount(rawBasePrompt, totalTasks);
    const pages = this.extractPptPageTitlesFromPrompt(
      basePrompt,
      fallbackPages,
      safePageCount,
    );
    const tasks: GenerationQueueTask[] = [];

    pages.forEach((pageTitle, pageIndex) => {
      for (let variant = 1; variant <= safePerPage; variant++) {
        tasks.push({
          prompt: this.buildPptPagePrompt(
            basePrompt,
            pageTitle,
            pageIndex,
            pages.length,
            variant,
            safePerPage,
          ),
          context,
          sequence: tasks.length + 1,
          inputImages: [...inputImages],
        });
      }
    });
    return tasks;
  }

  private decorateCurrentNoteTokenWithName(prompt: string): string {
    const basename = this.getActiveMarkdownBasename();
    if (!prompt || !basename) return prompt;
    this.currentNoteTokenPattern.lastIndex = 0;
    const next = prompt.replace(this.currentNoteTokenPattern, (match) =>
      /\([^)]+\)$/.test(match) ? match : `@current_note(${basename})`,
    );
    this.currentNoteTokenPattern.lastIndex = 0;
    return next;
  }

  private stripMarkdownNoise(content: string): string {
    return (content || "")
      .replace(/^---\n[\s\S]*?\n---\n?/m, "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ");
  }

  private collapseSpaces(text: string): string {
    return text
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private collectImageToImageConflictTips(text: string): string[] {
    const tips: string[] = [];
    if (/(换人|更换人物|不同的人|remove glasses|无眼镜|摘掉眼镜)/i.test(text)) {
      tips.push(this.tr("人物身份相关冲突：保持同一人物身份，不替换人物。", "Identity conflict: keep the same person identity, do not replace the person."));
    }
    if (/(85mm|特写|close[- ]?up|人像特写)/i.test(text)) {
      tips.push(this.tr("镜头构图冲突：优先保留参考图机位，镜头变化仅做轻微调整。", "Lens/composition conflict: keep original camera angle; only minor lens adjustment."));
    }
    if (/(黑暗虚空|纯黑背景|彻底更换背景|换场景|dark void)/i.test(text)) {
      tips.push(this.tr("场景冲突：优先保留原背景结构，只做氛围强化。", "Scene conflict: preserve original background structure and only enhance atmosphere."));
    }
    return tips;
  }

  private buildPptStyleSection(text: string): string[] {
    const hasStyleConstraints =
      /(风格|样式|背景|配色|颜色|字体|serif|sans|grid|布局|图表|质感|Claude|Anthropic|humanism|palette|typography|style)/i.test(text);
    if (hasStyleConstraints) {
      return [
        this.tr("【风格策略】", "[Style Strategy]"),
        this.tr(
          "严格沿用并执行用户提示词中已有的风格、配色、字体、排版与图表要求；不要覆盖或改写。",
          "Strictly follow the style, palette, typography, layout, and chart requirements already defined by the user; do not override or rewrite them.",
        ),
      ];
    }
    return [
      this.tr("【风格兜底（仅在未提供风格时生效）】", "[Style Fallback (only if user did not specify)]"),
      "Warm academic humanism, 16:9 single-slide output, card-based clean grid, readable Chinese typography.",
    ];
  }

  private compactPptPromptForTaskCount(prompt: string, totalTasks: number): string {
    const trimmed = (prompt || "").trim();
    if (!trimmed) return trimmed;
    const maxChars =
      totalTasks > 120 ? 1800 : totalTasks > 64 ? 2400 : totalTasks > 24 ? 3200 : 4600;
    if (trimmed.length <= maxChars) return trimmed;
    const keepHead = Math.floor(maxChars * 0.78);
    const keepTail = Math.max(180, maxChars - keepHead);
    return `${trimmed.slice(0, keepHead).trim()}\n...\n${trimmed
      .slice(Math.max(0, trimmed.length - keepTail))
      .trim()}`;
  }

  private extractPptPageTitlesFromPrompt(
    prompt: string,
    fallbackPages: string[],
    pageCount: number,
  ): string[] {
    const lines = (prompt || "").split("\n").map((line) => line.trim()).filter(Boolean);
    const found: string[] = [];
    const seen = new Set<string>();
    const explicitPatterns = [
      /^(?:[-*]\s*)?第\s*(\d{1,2})\s*页\s*[:：\-\s]+(.+)$/i,
      /^(?:[-*]\s*)?(?:页|page|slide)\s*(\d{1,2})\s*[:：\-\s]+(.+)$/i,
    ];

    for (const line of lines) {
      const match = explicitPatterns.map((pattern) => line.match(pattern)).find(Boolean);
      if (!match) continue;
      const title = (match[2] || "")
        .trim()
        .replace(/^["'""'']+|["'""'']+$/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!this.isValidPptTitle(title) || seen.has(title)) continue;
      seen.add(title);
      found.push(title);
      if (found.length >= pageCount) break;
    }

    if (found.length >= Math.min(4, pageCount)) {
      while (found.length < pageCount) found.push(fallbackPages[found.length]);
      return found.slice(0, pageCount);
    }
    return fallbackPages.slice(0, pageCount);
  }

  private isValidPptTitle(title: string): boolean {
    return Boolean(title) && title.length <= 80 &&
      !/^(ppt|slide|页面|页码|标题|全局风格|内容来源|页级|通用质量)/i.test(title);
  }

  private buildPptPagePrompt(
    basePrompt: string,
    pageTitle: string,
    pageIndex: number,
    pageCount: number,
    variant: number,
    safePerPage: number,
  ): string {
    return [
      basePrompt,
      "",
      this.tr("【当前仅生成这一页】", "[Generate This Page Only]"),
      `${this.tr("页码", "Page")}: ${pageIndex + 1}/${pageCount}`,
      `${this.tr("页面标题", "Slide title")}: ${pageTitle}`,
      this.tr("仅输出这一页的完整 PPT 画面，不要输出多页拼接图。", "Output only this single complete slide, not a multi-page collage."),
      `${this.tr("同页候选", "Variant")}: ${variant}/${safePerPage}`,
      this.tr("同页候选之间可做版式/构图/插图细节差异，但保持主题和风格一致。", "Variants can differ in layout/composition/illustration details while keeping theme and style consistent."),
    ].join("\n");
  }

  private getFallbackPptPageTitle(index: number): string {
    const defaults = [
      this.tr("封面", "Cover"),
      this.tr("这篇内容在讲什么", "What This Content Is About"),
      this.tr("核心概念拆解", "Core Concepts"),
      this.tr("流程图与主线", "Flow and Main Path"),
      this.tr("场景与命令对照", "Scenario-to-Command Mapping"),
      this.tr("关键对比", "Key Comparison"),
      this.tr("实操步骤", "Practical Steps"),
      this.tr("总结与行动", "Summary and Action"),
    ];
    return index < defaults.length
      ? defaults[index]
      : this.tr(`扩展内容 ${index + 1}`, `Extended Topic ${index + 1}`);
  }
}
