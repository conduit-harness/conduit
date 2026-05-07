const SENSITIVE_KEY_RE = /(token|api[_-]?key|authorization|cookie|secret|password)/i;

const TOKEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[bpoa]-[A-Za-z0-9-]+/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
];

export type RedactOptions = {
  homeDir?: string;
  workspaceRoot?: string;
  headLines?: number;
  tailLines?: number;
};

type Resolved = Required<Pick<RedactOptions, "headLines" | "tailLines">> & Pick<RedactOptions, "homeDir" | "workspaceRoot">;

const DEFAULT_HEAD_LINES = 50;
const DEFAULT_TAIL_LINES = 50;

function resolve(opts: RedactOptions): Resolved {
  return {
    headLines: opts.headLines ?? DEFAULT_HEAD_LINES,
    tailLines: opts.tailLines ?? DEFAULT_TAIL_LINES,
    ...(opts.homeDir !== undefined ? { homeDir: opts.homeDir } : {}),
    ...(opts.workspaceRoot !== undefined ? { workspaceRoot: opts.workspaceRoot } : {}),
  };
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePath(text: string, target: string, replacement: string): string {
  if (!target) return text;
  const variants = new Set([target, target.replace(/\\/g, "/"), target.replace(/\//g, "\\")]);
  let out = text;
  for (const variant of variants) {
    out = out.replace(new RegExp(escapeForRegex(variant), "g"), replacement);
  }
  return out;
}

export function redactString(value: string, opts: RedactOptions = {}): string {
  const r = resolve(opts);
  let out = value;
  if (r.workspaceRoot) out = replacePath(out, r.workspaceRoot, "<workspace>");
  if (r.homeDir) out = replacePath(out, r.homeDir, "~");
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, "<redacted>");
  return out;
}

export function trimLog(text: string, headLines = DEFAULT_HEAD_LINES, tailLines = DEFAULT_TAIL_LINES): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= headLines + tailLines + 1) return text;
  const head = lines.slice(0, headLines);
  const tail = lines.slice(-tailLines);
  const omitted = lines.length - head.length - tail.length;
  return [...head, `[…${omitted} lines redacted…]`, ...tail].join("\n");
}

function redactValue(value: unknown, r: Resolved): unknown {
  if (typeof value === "string") {
    let s = redactString(value, r);
    const lineCount = s.split(/\r?\n/).length;
    if (lineCount > r.headLines + r.tailLines + 1) s = trimLog(s, r.headLines, r.tailLines);
    return s;
  }
  if (Array.isArray(value)) return value.map(item => redactValue(item, r));
  if (value && typeof value === "object") return redactRecord(value as Record<string, unknown>, r);
  return value;
}

export function redactRecord(record: Record<string, unknown>, opts: RedactOptions = {}): Record<string, unknown> {
  const r = isResolved(opts) ? opts : resolve(opts);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = "<redacted>";
      continue;
    }
    out[k] = redactValue(v, r);
  }
  return out;
}

function isResolved(opts: RedactOptions): opts is Resolved {
  return typeof opts.headLines === "number" && typeof opts.tailLines === "number";
}

export function redactNdjson(text: string, opts: RedactOptions = {}): string {
  const r = resolve(opts);
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) { out.push(line); continue; }
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        out.push(JSON.stringify(redactRecord(parsed as Record<string, unknown>, r)));
      } else {
        out.push(redactString(line, r));
      }
    } catch {
      out.push(redactString(line, r));
    }
  }
  return out.join("\n");
}
