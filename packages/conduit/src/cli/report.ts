import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { redactLog } from "./redact.js";

export type ReportFlags = {
  repo: string;
  logsDir?: string;
  workspaceRoot?: string;
  domain?: string;
  type?: string;
  out?: string;
  gh?: boolean;
  noConfirm?: boolean;
  conduitVersion: string;
};

export type ReportSummary = {
  conduitVersion: string;
  platform: string;
  trackerKind: string | null;
  agentKind: string | null;
  attempts: number;
  lastError: string | null;
};

const REPO_SLUG = "conduit-harness/conduit";
const URL_DESCRIPTION_LIMIT = 6000;

export async function runReport(flags: ReportFlags): Promise<number> {
  const logsRoot = flags.logsDir ?? path.join(flags.repo, ".conduit", "logs");
  const logPath = path.join(logsRoot, "last-run.ndjson");
  const rawLog = existsSync(logPath) ? await readFile(logPath, "utf8") : "";
  const hasLog = rawLog.trim().length > 0;

  const redacted = hasLog
    ? redactLog(rawLog, {
        homeDir: os.homedir(),
        ...(flags.workspaceRoot ? { workspaceRoot: flags.workspaceRoot } : {}),
      })
    : "";
  const summary = summarize(rawLog, flags.conduitVersion);
  const domain = flags.domain ?? "Core";
  const issueType = flags.type ?? (hasLog ? "Bug" : "Question / discussion");
  let body = composeBody(summary, redacted, hasLog);

  if (!flags.noConfirm) {
    process.stderr.write(previewBlock(domain, issueType, body));
    const choice = await prompt("File this report? [y/N/edit] ");
    const normalized = choice.trim().toLowerCase();
    if (normalized === "edit" || normalized === "e") {
      body = await editInExternalEditor(body);
      process.stderr.write(previewBlock(domain, issueType, body));
      const confirm = await prompt("File this report? [y/N] ");
      if (confirm.trim().toLowerCase() !== "y") {
        process.stderr.write("aborted by user.\n");
        return 1;
      }
    } else if (normalized !== "y") {
      process.stderr.write("aborted by user.\n");
      return 1;
    }
  } else {
    process.stderr.write(previewBlock(domain, issueType, body));
  }

  if (flags.out) {
    await writeFile(flags.out, body, "utf8");
    process.stderr.write(`wrote redacted report body to ${flags.out}\n`);
    return 0;
  }

  if (flags.gh) {
    return await fileViaGh(domain, issueType, body);
  }

  const url = buildIssueUrl(domain, issueType, body);
  if (body.length > URL_DESCRIPTION_LIMIT) {
    process.stderr.write(`note: report body is long (${body.length} chars); the URL may be truncated by GitHub. Consider --gh or --out.\n`);
  }
  process.stdout.write(`${url}\n`);
  return 0;
}

function summarize(rawLog: string, conduitVersion: string): ReportSummary {
  const platform = `${os.platform()}-${os.arch()}`;
  let trackerKind: string | null = null;
  let agentKind: string | null = null;
  let attempts = 0;
  let lastError: string | null = null;
  if (rawLog.length > 0) {
    for (const line of rawLog.split(/\r?\n/)) {
      if (line.length === 0) continue;
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(line) as Record<string, unknown>; } catch { /* skip malformed line */ }
      if (!parsed) continue;
      if (typeof parsed.tracker === "string") trackerKind = parsed.tracker;
      if (typeof parsed.agent === "string") agentKind = parsed.agent;
      if (parsed.message === "agent starting") attempts += 1;
      if (typeof parsed.error === "string" && parsed.error.length > 0) lastError = parsed.error;
    }
  }
  return { conduitVersion, platform, trackerKind, agentKind, attempts, lastError };
}

function composeBody(summary: ReportSummary, redactedLog: string, hasLog: boolean): string {
  const lines: string[] = [];
  lines.push("## Run summary");
  lines.push("");
  lines.push(`- **Conduit version:** ${summary.conduitVersion}`);
  lines.push(`- **OS / arch:** ${summary.platform}`);
  if (summary.trackerKind) lines.push(`- **Tracker:** ${summary.trackerKind}`);
  if (summary.agentKind) lines.push(`- **Runner:** ${summary.agentKind}`);
  if (summary.attempts > 0) lines.push(`- **Attempts in last run:** ${summary.attempts}`);
  if (summary.lastError) lines.push(`- **Last error:** ${summary.lastError}`);
  lines.push("");
  lines.push("## What happened");
  lines.push("");
  lines.push("<!-- Describe what you were doing and what went wrong. -->");
  lines.push("");
  if (hasLog) {
    lines.push("## Recent run log (redacted, best-effort)");
    lines.push("");
    lines.push("<details><summary>last-run.ndjson</summary>");
    lines.push("");
    lines.push("```");
    lines.push(redactedLog);
    lines.push("```");
    lines.push("");
    lines.push("</details>");
    lines.push("");
    lines.push("_Redaction is best-effort. Please review the log above and edit before submitting._");
  } else {
    lines.push("_No recent run log found at `.conduit/logs/last-run.ndjson` — run `conduit once` to capture one._");
  }
  return lines.join("\n");
}

function previewBlock(domain: string, issueType: string, body: string): string {
  return [
    "",
    "----- Conduit report preview -----",
    `Domain: ${domain}`,
    `Type:   ${issueType}`,
    "",
    body,
    "----- end preview -----",
    "",
  ].join("\n");
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try { return await rl.question(question); } finally { rl.close(); }
}

async function editInExternalEditor(body: string): Promise<string> {
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? (process.platform === "win32" ? "notepad" : "vi");
  const tmpFile = path.join(os.tmpdir(), `conduit-report-${process.pid}-${Date.now()}.md`);
  await writeFile(tmpFile, body, "utf8");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [tmpFile], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", () => resolve());
  });
  return await readFile(tmpFile, "utf8");
}

async function fileViaGh(domain: string, issueType: string, body: string): Promise<number> {
  const tmpFile = path.join(os.tmpdir(), `conduit-report-${process.pid}-${Date.now()}.md`);
  await writeFile(tmpFile, body, "utf8");
  const title = `${domain}: ${issueType.toLowerCase()} from conduit report`;
  const args = ["issue", "create", "--repo", REPO_SLUG, "--title", title, "--body-file", tmpFile];
  return await new Promise<number>((resolve) => {
    const child = spawn("gh", args, { stdio: "inherit" });
    child.on("error", err => {
      process.stderr.write(`gh failed to launch: ${err.message}\nFalling back to URL mode — re-run without --gh.\n`);
      resolve(1);
    });
    child.on("exit", code => resolve(code ?? 1));
  });
}

export function buildIssueUrl(domain: string, issueType: string, description: string): string {
  const params = new URLSearchParams();
  params.set("template", "issue.yml");
  params.set("domain", domain);
  params.set("type", issueType);
  params.set("description", description);
  return `https://github.com/${REPO_SLUG}/issues/new?${params.toString()}`;
}
