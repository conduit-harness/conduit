export type RedactionOptions = {
  homeDir?: string;
  workspaceRoot?: string;
  headLines?: number;
  tailLines?: number;
};

const SENSITIVE_KEY = /token|api[_-]?key|authorization|cookie|secret|password/i;
const TOKEN_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];
const REDACTED = "<redacted>";

export function redactLog(input: string, options: RedactionOptions = {}): string {
  const headLines = options.headLines ?? 50;
  const tailLines = options.tailLines ?? 50;
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const trimmedTail = lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  const truncated = truncateLines(trimmedTail, headLines, tailLines);
  return truncated.map(line => redactLine(line, options)).join("\n");
}

export function redactText(text: string, options: RedactionOptions = {}): string {
  let result = text;
  for (const pat of TOKEN_PATTERNS) result = result.replace(pat, REDACTED);
  if (options.workspaceRoot) result = replaceAll(result, options.workspaceRoot, "<workspace>");
  if (options.homeDir) result = replaceAll(result, options.homeDir, "~");
  return result;
}

function redactLine(line: string, options: RedactionOptions): string {
  if (line.length === 0) return line;
  const trimmed = line.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed && typeof parsed === "object") return JSON.stringify(redactValue(parsed, options));
    } catch {
      // not valid JSON, fall through
    }
  }
  return redactText(line, options);
}

function redactValue(value: unknown, options: RedactionOptions): unknown {
  if (Array.isArray(value)) return value.map(v => redactValue(v, options));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        result[k] = REDACTED;
        continue;
      }
      if ((k === "fullLog" || k === "output") && typeof v === "string") {
        const inner = redactText(v, options);
        result[k] = truncateInnerText(inner, options.headLines ?? 50, options.tailLines ?? 50);
        continue;
      }
      result[k] = typeof v === "string" ? redactText(v, options) : redactValue(v, options);
    }
    return result;
  }
  if (typeof value === "string") return redactText(value, options);
  return value;
}

function truncateLines(lines: string[], head: number, tail: number): string[] {
  if (lines.length <= head + tail + 1) return lines;
  const dropped = lines.length - head - tail;
  return [...lines.slice(0, head), `[…${dropped} lines redacted…]`, ...lines.slice(-tail)];
}

function truncateInnerText(text: string, head: number, tail: number): string {
  const lines = text.split("\n");
  if (lines.length <= head + tail + 1) return text;
  const dropped = lines.length - head - tail;
  return [...lines.slice(0, head), `[…${dropped} lines redacted…]`, ...lines.slice(-tail)].join("\n");
}

function replaceAll(haystack: string, needle: string, replacement: string): string {
  if (!needle) return haystack;
  return haystack.split(needle).join(replacement);
}
