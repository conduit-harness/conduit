#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { loadDotEnv, discoverWorkflow, loadWorkflow, buildConfig, validateForDispatch } from "../config/workflow.js";
import { Logger, type LogLevel } from "../logging/logger.js";
import { FileLogSink } from "../logging/file-sink.js";
import { FakeTracker } from "../tracker/fake.js";
import type { IssueTracker } from "../tracker/tracker.js";
import { FakeAgentRunner, type AgentRunner } from "../agent/runner.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { buildReport, defaultLogPath, ISSUE_REPO, readLastRunLog, readPackageVersion, type ReportOptions } from "../reporting/report.js";

type Args = { command: string; flags: Record<string, string | boolean> };

function parse(argv: string[]): Args {
  const [command = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) { flags[key] = next; i++; } else flags[key] = true;
  }
  return { command, flags };
}

function flag(flags: Record<string, string | boolean>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function resolvePath(base: string, value: string): string {
  const expanded = value === "~" ? os.homedir() : value.startsWith(`~${path.sep}`) || value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
  return path.resolve(base, expanded);
}

async function version(): Promise<string> {
  const raw = await readFile(path.join(packageRoot(), "package.json"), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

async function init(flags: Record<string, string | boolean>) {
  const repo = resolvePath(process.cwd(), flag(flags, "repo") ?? ".");
  const workflowTarget = resolvePath(repo, flag(flags, "workflow") ?? "WORKFLOW.md");
  const envTarget = resolvePath(repo, flag(flags, "env") ?? ".env");
  const force = !!flags.force;
  const workflowSource = flags.fake
    ? path.join(packageRoot(), ".conduit/workflow.example.md")
    : path.join(packageRoot(), "examples/workflows/linear-codex.md");

  await copyFileIfAllowed(workflowSource, workflowTarget, force);
  await copyFileIfAllowed(path.join(packageRoot(), ".env.example"), envTarget, force);
  if (flags.gitignore) await appendGitIgnore(repo);

  console.log(`Initialized Conduit files:\n  workflow: ${workflowTarget}\n  env:      ${envTarget}`);
  if (!flags.gitignore) console.log("Tip: pass --gitignore to append Conduit ignore rules to the target repo .gitignore.");
}

async function copyFileIfAllowed(source: string, target: string, force: boolean) {
  if (!force && existsSync(target)) throw new Error(`init_refusing_to_overwrite: ${target} (use --force)`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await readFile(source, "utf8"));
}

async function appendGitIgnore(repo: string) {
  const file = path.join(repo, ".gitignore");
  const rules = [".env", ".env.*", "!.env.example", ".conduit/state/", ".conduit/workspaces/", ".conduit/logs/"];
  const existing = existsSync(file) ? await readFile(file, "utf8") : "";
  const missing = rules.filter(rule => !existing.split(/\r?\n/).includes(rule));
  if (missing.length === 0) return;
  await writeFile(file, `${existing}${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}${missing.join("\n")}\n`);
}

async function resolveLogsRoot(repo: string, workflowFlag: string | undefined): Promise<string> {
  try {
    const workflowPath = await discoverWorkflow(repo, workflowFlag);
    if (!existsSync(workflowPath)) return path.join(repo, ".conduit/logs");
    const workflow = await loadWorkflow(workflowPath);
    return buildConfig(workflow, repo).logs.root;
  } catch {
    return path.join(repo, ".conduit/logs");
  }
}

async function loadPlugin<T>(role: "tracker" | "runner", kind: string, config: ReturnType<typeof buildConfig>): Promise<T> {
  const pkg = `@conduit-harness/conduit-${role}-${kind}`;
  try {
    const mod = await import(pkg) as { default: new (cfg: typeof config) => T };
    return new mod.default(config);
  } catch (cause) {
    const isNotFound = cause instanceof Error && (cause.message.includes("Cannot find package") || cause.message.includes("ERR_MODULE_NOT_FOUND") || cause.message.includes("ERR_PACKAGE_PATH_NOT_EXPORTED"));
    if (isNotFound) throw new Error(`${role} '${kind}' requires ${pkg} — install it with: pnpm add ${pkg}`);
    throw cause;
  }
}

async function report(flags: Record<string, string | boolean>) {
  const repo = resolvePath(process.cwd(), flag(flags, "repo") ?? ".");
  const logsRoot = await resolveLogsRoot(repo, flag(flags, "workflow"));
  const { content, exists, path: logPath } = await readLastRunLog(defaultLogPath(logsRoot));
  const conduitVersion = await readPackageVersion();
  const opts: ReportOptions = {
    homeDir: os.homedir(),
    workspaceRoot: repo,
    ...(flag(flags, "domain") !== undefined ? { domain: flag(flags, "domain")! } : {}),
    ...(flag(flags, "type") !== undefined ? { type: flag(flags, "type")! } : {}),
    ...(flag(flags, "title") !== undefined ? { title: flag(flags, "title")! } : {}),
  };
  const built = buildReport({ rawLog: content, logExists: exists, conduitVersion, options: opts });

  const outFlag = flag(flags, "out");
  if (outFlag) {
    const target = resolvePath(repo, outFlag);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, built.body, "utf8");
    console.log(`Wrote redacted issue body to ${target}`);
  }

  if (!exists) {
    process.stderr.write(`No log file found at ${logPath} — filing without a log.\n`);
    process.stderr.write(`(Run 'conduit once' first to capture one. If the run was started with --no-log-file, no log was written.)\n`);
  }

  let body = built.body;
  const noConfirm = !!flags["no-confirm"];
  if (!noConfirm) {
    process.stderr.write("\n--- Redacted issue preview (review for sensitive data) ---\n");
    process.stderr.write(body + "\n");
    process.stderr.write("--- end preview ---\n\n");
    const answer = await prompt("File this report? [y/N/edit] ");
    const choice = answer.trim().toLowerCase();
    if (choice === "edit" || choice === "e") {
      body = await editInExternalEditor(body);
    } else if (choice !== "y" && choice !== "yes") {
      console.log("Aborted. No issue filed.");
      return;
    }
  } else {
    process.stderr.write(body + "\n");
  }

  if (flags.gh) {
    await fileViaGh(built.title, body);
    return;
  }

  const url = buildUrlWithBody(built.url, body, opts);
  console.log("Open this URL to file the issue:");
  console.log(url);
}

function buildUrlWithBody(originalUrl: string, body: string, opts: ReportOptions): string {
  const u = new URL(originalUrl);
  u.searchParams.set("description", body);
  if (opts.domain) u.searchParams.set("domain", opts.domain);
  if (opts.type) u.searchParams.set("type", opts.type);
  if (opts.title) u.searchParams.set("title", opts.title);
  return u.toString();
}

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}

async function editInExternalEditor(initial: string): Promise<string> {
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? (process.platform === "win32" ? "notepad" : "vi");
  const tmpDir = await fsTmpDir();
  const tmpFile = path.join(tmpDir, `conduit-report-${Date.now()}.md`);
  await writeFile(tmpFile, initial, "utf8");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [tmpFile], { stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`editor_exited_${code}`)));
    child.on("error", reject);
  });
  return await readFile(tmpFile, "utf8");
}

async function fsTmpDir(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return await mkdtemp(path.join(os.tmpdir(), "conduit-report-"));
}

async function fileViaGh(title: string, body: string): Promise<void> {
  const tmp = await fsTmpDir();
  const bodyFile = path.join(tmp, "body.md");
  await writeFile(bodyFile, body, "utf8");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("gh", ["issue", "create", "--repo", ISSUE_REPO, "--title", title, "--body-file", bodyFile], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`gh_exited_${code}`)));
    child.on("error", err => {
      const message = err instanceof Error && /ENOENT/.test(err.message) ? "gh CLI not found on PATH — install from https://cli.github.com or omit --gh." : err.message;
      reject(new Error(message));
    });
  });
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.command === "help" || args.flags.help) return usage();
  if (args.command === "version" || args.flags.version) { console.log(await version()); return; }
  if (args.command === "init") { await init(args.flags); return; }
  if (args.command === "report") { await report(args.flags); return; }

  const repo = resolvePath(process.cwd(), flag(args.flags, "repo") ?? ".");
  await loadDotEnv(resolvePath(repo, flag(args.flags, "env") ?? ".env"));
  const workflowPath = await discoverWorkflow(repo, flag(args.flags, "workflow"));
  const workflow = await loadWorkflow(workflowPath);
  const stateRoot = flag(args.flags, "state-dir");
  const config = buildConfig(workflow, repo, stateRoot ? { stateRoot } : {});
  const level = (flag(args.flags, "log-level") as LogLevel | undefined) ?? "info";
  const noLogFile = !!args.flags["no-log-file"];
  const sinkPath = (args.command === "once" || args.command === "start") && !noLogFile ? defaultLogPath(config.logs.root) : null;
  const sink = sinkPath ? new FileLogSink(sinkPath) : undefined;
  const logger = sink ? new Logger(level, sink) : new Logger(level);

  if (args.command === "validate") {
    validateForDispatch(config);
    if (args.flags.preflight) {
      const tracker: IssueTracker = config.tracker.kind === "fake" ? new FakeTracker(config) : await loadPlugin<IssueTracker>("tracker", config.tracker.kind, config);
      const agent: AgentRunner = config.agent.kind === "fake" ? new FakeAgentRunner() : await loadPlugin<AgentRunner>("runner", config.agent.kind, config);
      if (tracker.preflightAuth) await tracker.preflightAuth();
      if (agent.preflightAuth) await agent.preflightAuth();
    }
    logger.info("workflow valid", { workflow: workflow.path, tracker: config.tracker.kind, agent: config.agent.kind, repo: config.repoPath, state: config.state.root });
    return;
  }

  if (args.command !== "once" && args.command !== "start") return usage(1);
  if (!args.flags["dry-run"]) validateForDispatch(config);
  const tracker: IssueTracker = config.tracker.kind === "fake" ? new FakeTracker(config) : await loadPlugin<IssueTracker>("tracker", config.tracker.kind, config);
  const agent: AgentRunner = config.agent.kind === "fake" ? new FakeAgentRunner() : await loadPlugin<AgentRunner>("runner", config.agent.kind, config);
  const orch = new Orchestrator(config, workflow, tracker, agent, logger);
  logger.info("run starting", { command: args.command, tracker: config.tracker.kind, agent: config.agent.kind, repo: config.repoPath, logFile: sinkPath });
  if (!args.flags["dry-run"]) await orch.recoverStaleAttempts();

  if (args.command === "once") { await orch.tick({ dryRun: !!args.flags["dry-run"] }); return; }
  let stopped = false;
  process.on("SIGINT", () => stopped = true);
  process.on("SIGTERM", () => stopped = true);
  while (!stopped) {
    await orch.tick({ dryRun: !!args.flags["dry-run"] });
    await new Promise(r => setTimeout(r, config.polling.intervalMs));
  }
}

function usage(exitCode = 0) {
  console.log(`Usage: conduit <init|validate|once|start|report|version> [options]\n\nCommands:\n  init       Create local workflow/env starter files\n  validate   Parse and validate workflow/configuration\n  once       Run one fetch/filter/dispatch cycle\n  start      Run the polling loop continuously\n  report     Draft a sanitized GitHub issue from the latest run log\n  version    Print the Conduit package version\n\nOptions:\n  --workflow PATH       Workflow markdown path\n  --repo PATH           Target repository path\n  --env PATH            Dotenv file path\n  --state-dir PATH      Runtime state directory override\n  --dry-run             Select issues without dispatching agents\n  --no-log-file         Disable the run-log file sink for once/start\n  --preflight           Validate required external integration settings\n  --log-level LEVEL     debug|info|warn|error\n  --force               init: overwrite existing files\n  --fake                init: use fake local workflow instead of Linear/Codex example\n  --gitignore           init: append Conduit ignore rules to target .gitignore\n  --gh                  report: file via gh CLI instead of printing a URL\n  --out PATH            report: also write the redacted body to PATH\n  --no-confirm          report: skip the y/N/edit prompt (still prints preview to stderr)\n  --domain VALUE        report: override the issue Domain field (default: Core)\n  --type VALUE          report: override the issue Type field (default: Bug)\n  --title VALUE         report: override the issue title\n  --version             Print version\n`);
  process.exit(exitCode);
}

main().catch(err => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
