type ImageErrorCode =
  | "超时"
  | "余额不足"
  | "鉴权失败"
  | "网络异常"
  | "服务异常"
  | "无效图片"
  | "未知错误";

type Translator = (zh: string, en: string) => string;

interface NormalizedImageError {
  code: ImageErrorCode;
  message: string;
  suggestion: string;
}

export function isRetryableImageErrorCode(code: ImageErrorCode): boolean {
  return code === "超时" || code === "网络异常" || code === "服务异常";
}

export function normalizeImageError(
  rawError: unknown,
  tr: Translator,
): NormalizedImageError {
  const source =
    rawError instanceof Error ? rawError.message : String(rawError || "");
  const text = source.toLowerCase();

  if (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("超时")
  ) {
    return {
      code: "超时",
      message: tr(
        "请求超时，请稍后重试。",
        "Request timed out. Please try again later.",
      ),
      suggestion: tr(
        "可降低分辨率或切换更快的模型。",
        "Try lowering resolution or using a faster model.",
      ),
    };
  }

  if (
    text.includes("quota") ||
    text.includes("insufficient") ||
    text.includes("balance") ||
    text.includes("credit") ||
    text.includes("429") ||
    text.includes("余额")
  ) {
    return {
      code: "余额不足",
      message: tr(
        "账户额度或余额不足，无法继续生图。",
        "Insufficient account quota/balance. Unable to continue generation.",
      ),
      suggestion: tr(
        "请检查服务商余额、配额或账单状态。",
        "Please check provider balance, quota, or billing status.",
      ),
    };
  }

  if (
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("api key") ||
    text.includes("auth") ||
    text.includes("401") ||
    text.includes("403") ||
    text.includes("密钥")
  ) {
    return {
      code: "鉴权失败",
      message: tr(
        "API 鉴权失败，请检查密钥配置。",
        "API authentication failed. Please check key settings.",
      ),
      suggestion: tr(
        "确认 API Key、生图模型和 Provider 配置。",
        "Confirm API key, image model, and provider configuration.",
      ),
    };
  }

  if (
    text.includes("network") ||
    text.includes("fetch") ||
    text.includes("econn") ||
    text.includes("socket") ||
    text.includes("dns") ||
    text.includes("连接")
  ) {
    return {
      code: "网络异常",
      message: tr(
        "网络连接异常，暂时无法访问生图服务。",
        "Network error. Unable to access image generation service.",
      ),
      suggestion: tr(
        "请检查网络、代理或稍后重试。",
        "Check network/proxy or retry later.",
      ),
    };
  }

  if (
    text.includes("不是有效图片") ||
    text.includes("invalid image") ||
    text.includes("malformed image") ||
    text.includes("未识别到 png")
  ) {
    return {
      code: "无效图片",
      message: tr(
        "Provider 没有返回真实图片，当前任务未完成。",
        "Provider did not return a real image. Current task did not complete.",
      ),
      suggestion: tr(
        "Codex CLI 需要输出有效 PNG/JPEG/WebP/GIF；可重试或切换原生生图 Provider。",
        "Codex CLI must output a valid PNG/JPEG/WebP/GIF; retry or switch to a native image provider.",
      ),
    };
  }

  if (
    text.includes("500") ||
    text.includes("502") ||
    text.includes("503") ||
    text.includes("504") ||
    text.includes("bad gateway") ||
    text.includes("service unavailable") ||
    text.includes("invalid request") ||
    text.includes("provider")
  ) {
    return {
      code: "服务异常",
      message: tr(
        "生图服务返回异常，请稍后重试。",
        "Image service returned an error. Please retry later.",
      ),
      suggestion: tr(
        "可切换模型或 Provider 再试。",
        "Try switching model or provider.",
      ),
    };
  }

  return {
    code: "未知错误",
    message: tr(
      "发生未知错误，当前任务未完成。",
      "Unknown error. Current task did not complete.",
    ),
    suggestion: tr(
      "可先重试失败项，或切换模型后再试。",
      "Retry failed items first, or switch model and retry.",
    ),
  };
}

export function formatImageError(rawError: unknown, tr: Translator): string {
  const normalized = normalizeImageError(rawError, tr);
  const codeLabel = tr(
    normalized.code,
    {
      超时: "TIMEOUT",
      余额不足: "INSUFFICIENT_BALANCE",
      鉴权失败: "AUTH_FAILED",
      网络异常: "NETWORK_ERROR",
      服务异常: "SERVICE_ERROR",
      无效图片: "INVALID_IMAGE",
      未知错误: "UNKNOWN_ERROR",
    }[normalized.code] || "UNKNOWN_ERROR",
  );
  return (
    tr("错误码[", "Error[") +
    codeLabel +
    "] " +
    normalized.message +
    tr(" 建议：", " Suggestion: ") +
    normalized.suggestion
  );
}
