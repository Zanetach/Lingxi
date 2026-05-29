export function buildCodexArgs(
  raw: string,
  cwd: string | undefined,
  imagePaths: string[] = [],
): string[] {
  const args = parseCodexArgs(raw || "exec");
  if (cwd && !hasCliOption(args, "--cd", "-C")) {
    const insertAt = args[0] === "exec" ? 1 : args.length;
    args.splice(insertAt, 0, "--cd", cwd);
  }
  for (const imagePath of imagePaths) {
    args.push("--image", imagePath);
  }
  return args;
}

export function buildCodexCommandArgs(
  raw: string,
  cwd: string | undefined,
  prompt: string,
  imagePaths: string[] = [],
  outputLastMessagePath?: string,
): string[] {
  const args = buildCodexArgs(raw, cwd, imagePaths);
  if (outputLastMessagePath) {
    const imageOptionStart = args.indexOf("--image");
    const insertAt = imageOptionStart >= 0 ? imageOptionStart : args.length;
    args.splice(insertAt, 0, "--output-last-message", outputLastMessagePath);
  }
  return imagePaths.length > 0 ? [...args, "--", prompt] : [...args, prompt];
}

function hasCliOption(args: string[], longName: string, shortName: string): boolean {
  return args.some(
    (arg) =>
      arg === longName ||
      arg.startsWith(`${longName}=`) ||
      arg === shortName ||
      arg.startsWith(`${shortName}=`),
  );
}

function parseCodexArgs(raw: string): string[] {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    args.push(match[1] ?? match[2] ?? match[0]);
  }
  return args;
}
