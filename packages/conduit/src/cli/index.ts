#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv, discoverWorkflow, loadWorkflow, buildConfig, validateForDispatch } from "../config/workflow.js";
import { Logger, openLogSink, type LogLevel } from "../logging/logger.js";
import { FakeTracker } from "../tracker/fake.js";
import type { IssueTracker } from "../tracker/tracker.js";
import { FakeAgentRunner, type AgentRunner } from "../agent/runner.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { runReport } from "./report.js";

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
  const rules = [".env", ".env.*", "!.env.example", ".conduit/state/", ".conduit/workspaces/"];
  const existing = existsSync(file) ? await readFile(file, "utf8") : "";
  const missing = rules.filter(rule => !existing.split(/\r?\n/).includes(rule));
  if (missing.length === 0) return;
  await writeFile(file, `${existing}${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}${missing.join("\n")}\n`);
}

async function tryDetectWorkspaceRoot(repo: string, flags: Record<string, string | boolean>): Promise<string | undefined> {
  try {
    const workflowPath = await discoverWorkflow(repo, flag(flags, "workflow"));
    if (!existsSync(workflowPath)) return undefined;
    const workflow = await loadWorkflow(workflowPath);
    return buildConfig(workflow, repo).workspace.root;
  } catch {
    return undefined;
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

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.command === "help" || args.flags.help) return usage();
  if (args.command === "version" || args.flags.version) { console.log(await version()); return; }
  if (args.command === "init") { await init(args.flags); return; }
  if (args.command === "report") {
    const repoForReport = resolvePath(process.cwd(), flag(args.flags, "repo") ?? ".");
    const workspaceRoot = await tryDetectWorkspaceRoot(repoForReport, args.flags);
    const code = await runReport({
      repo: repoForReport,
      ...(flag(args.flags, "logs-dir") ? { logsDir: resolvePath(repoForReport, flag(args.flags, "logs-dir")!) } : {}),
      ...(workspaceRoot ? { workspaceRoot } : {}),
      ...(flag(args.flags, "domain") ? { domain: flag(args.flags, "domain")! } : {}),
      ...(flag(args.flags, "type") ? { type: flag(args.flags, "type")! } : {}),
      ...(flag(args.flags, "out") ? { out: resolvePath(process.cwd(), flag(args.flags, "out")!) } : {}),
      gh: !!args.flags.gh,
      noConfirm: !!args.flags["no-confirm"],
      conduitVersion: await version(),
    });
    if (code !== 0) process.exit(code);
    return;
  }

  const repo = resolvePath(process.cwd(), flag(args.flags, "repo") ?? ".");
  await loadDotEnv(resolvePath(repo, flag(args.flags, "env") ?? ".env"));
  const workflowPath = await discoverWorkflow(repo, flag(args.flags, "workflow"));
  const workflow = await loadWorkflow(workflowPath);
  const stateRoot = flag(args.flags, "state-dir");
  const config = buildConfig(workflow, repo, stateRoot ? { stateRoot } : {});
  const logLevel = (flag(args.flags, "log-level") as LogLevel | undefined) ?? "info";
  const sinkPath = (args.command === "once" || args.command === "start") && !args.flags["no-log-file"]
    ? openLogSink(path.join(config.logs.root, "last-run.ndjson"))
    : undefined;
  const logger = new Logger(logLevel, sinkPath ? { sinkPath } : {});

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
  console.log(`Usage: conduit <init|validate|once|start|report|version> [options]\n\nCommands:\n  init       Create local workflow/env starter files\n  validate   Parse and validate workflow/configuration\n  once       Run one fetch/filter/dispatch cycle\n  start      Run the polling loop continuously\n  report     Draft a sanitized GitHub issue from the latest run\n  version    Print the Conduit package version\n\nOptions:\n  --workflow PATH       Workflow markdown path\n  --repo PATH           Target repository path\n  --env PATH            Dotenv file path\n  --state-dir PATH      Runtime state directory override\n  --dry-run             Select issues without dispatching agents\n  --preflight           Validate required external integration settings\n  --log-level LEVEL     debug|info|warn|error\n  --no-log-file         once/start: do not write .conduit/logs/last-run.ndjson\n  --force               init: overwrite existing files\n  --fake                init: use fake local workflow instead of Linear/Codex example\n  --gitignore           init: append Conduit ignore rules to target .gitignore\n  --gh                  report: file via the gh CLI instead of opening a URL\n  --out PATH            report: write the redacted body to a file\n  --no-confirm          report: skip the interactive preview/confirmation\n  --domain VALUE        report: pre-fill the issue template Domain field (default: Core)\n  --type VALUE          report: pre-fill the issue template Type field\n  --logs-dir PATH       report: override the directory containing last-run.ndjson\n  --version             Print version\n`);
  process.exit(exitCode);
}

main().catch(err => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
