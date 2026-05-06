import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import dotenv from "dotenv";
import { z } from "zod";
import type { ServiceConfig, WorkflowDefinition } from "../domain/types.js";

export async function loadDotEnv(envPath: string | undefined) {
  if (envPath) dotenv.config({ path: envPath, override: false, quiet: true });
}

export async function discoverWorkflow(repoPath: string, explicit?: string): Promise<string> {
  if (explicit) return resolveConfiguredPath(repoPath, explicit);
  return path.resolve(repoPath, "WORKFLOW.md");
}

export async function loadWorkflow(workflowPath: string): Promise<WorkflowDefinition> {
  let raw: string;
  try { raw = await readFile(workflowPath, "utf8"); } catch (cause) { throw new Error(`missing_workflow_file: ${workflowPath}`, { cause }); }
  if (!raw.startsWith("---")) return { path: workflowPath, config: {}, promptTemplate: raw.trim() };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) throw new Error("invalid_workflow_front_matter: missing closing ---");
  const yamlText = raw.slice(3, end).trim();
  const body = raw.slice(raw.indexOf("\n", end + 1) + 1).trim();
  const parsed = yamlText.length ? YAML.parse(yamlText) : {};
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_workflow_front_matter: expected YAML object");
  return { path: workflowPath, config: parsed as Record<string, unknown>, promptTemplate: body };
}

const unknownRecord = z.record(z.string(), z.unknown());
const rawSchema = z.object({
  tracker: unknownRecord.optional(), polling: unknownRecord.optional(), workspace: unknownRecord.optional(), state: unknownRecord.optional(), hooks: unknownRecord.optional(), agent: unknownRecord.optional(),
}).passthrough();

function stringList(value: unknown, fallback: string[]): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : fallback; }
function intValue(value: unknown, fallback: number): number { const n = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : NaN; return Number.isFinite(n) ? n : fallback; }
function boolValue(value: unknown, fallback: boolean): boolean { return typeof value === "boolean" ? value : fallback; }
function strValue(value: unknown, fallback: string): string { return typeof value === "string" && value.length > 0 ? value : fallback; }
function maybeStr(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function action(value: unknown) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const transitionTo = maybeStr(v.transition_to);
  return transitionTo ? { comment: boolValue(v.comment, false), transitionTo } : { comment: boolValue(v.comment, false) };
}
function optionalProps<T extends Record<string, unknown>>(obj: T): T { return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T; }
function expandHome(value: string): string { return value === "~" ? os.homedir() : value.startsWith("~/") || value.startsWith(`~${path.sep}`) ? path.join(os.homedir(), value.slice(2)) : value; }
function resolveConfiguredPath(repoPath: string, value: string): string { return path.resolve(repoPath, expandHome(value)); }
function resolveRawEnvRefs(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => process.env[name] ?? `$${name}`) : v]));
}

export function buildConfig(workflow: WorkflowDefinition, repoPath: string, overrides: { stateRoot?: string } = {}): ServiceConfig {
  const raw = rawSchema.parse(workflow.config);
  const tracker = raw.tracker ?? {}; const polling = raw.polling ?? {}; const workspace = raw.workspace ?? {}; const state = raw.state ?? {}; const hooks = raw.hooks ?? {}; const agent = raw.agent ?? {};
  const writesRaw = tracker.writes && typeof tracker.writes === "object" && !Array.isArray(tracker.writes) ? tracker.writes as Record<string, unknown> : {};
  const maxByStateRaw = agent.max_concurrent_agents_by_state && typeof agent.max_concurrent_agents_by_state === "object" && !Array.isArray(agent.max_concurrent_agents_by_state) ? agent.max_concurrent_agents_by_state as Record<string, unknown> : {};
  const maxByState: Record<string, number> = {};
  for (const [k, v] of Object.entries(maxByStateRaw)) { const n = intValue(v, 0); if (n > 0) maxByState[k.toLowerCase()] = n; }
  const trackerKind = strValue(tracker.kind, "fake");
  const agentKind = strValue(agent.kind, "fake");
  const agentSectionRaw = (workflow.config[agentKind] as Record<string, unknown> | undefined) ?? {};
  return {
    repoPath: path.resolve(repoPath), workflowPath: workflow.path,
    tracker: {
      kind: trackerKind,
      activeStates: stringList(tracker.active_states, ["Todo", "In Progress"]),
      terminalStates: stringList(tracker.terminal_states, ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]),
      requiredLabels: stringList(tracker.required_labels, []),
      excludedLabels: stringList(tracker.excluded_labels, []),
      pageSize: intValue(tracker.page_size, 50),
      writes: { enabled: boolValue(writesRaw.enabled, false), actions: { on_start: action(writesRaw.on_start), on_success: action(writesRaw.on_success), on_failure: action(writesRaw.on_failure), on_terminal_failure: action(writesRaw.on_terminal_failure) } },
      raw: resolveRawEnvRefs(tracker as Record<string, unknown>),
    },
    polling: { intervalMs: intValue(polling.interval_ms, 30000) },
    workspace: { root: resolveConfiguredPath(repoPath, strValue(workspace.root, ".conduit/workspaces")), strategy: "git-worktree", baseRef: strValue(workspace.base_ref, "main") },
    state: { root: resolveConfiguredPath(repoPath, overrides.stateRoot ?? strValue(state.root, ".conduit/state")) },
    hooks: optionalProps({ afterCreate: maybeStr(hooks.after_create), beforeRun: maybeStr(hooks.before_run), afterRun: maybeStr(hooks.after_run), beforeRemove: maybeStr(hooks.before_remove), timeoutMs: Math.max(1, intValue(hooks.timeout_ms, 60000)) }),
    agent: {
      kind: agentKind,
      maxConcurrentAgents: Math.max(1, intValue(agent.max_concurrent_agents, 10)),
      maxAttempts: Math.max(0, intValue(agent.max_attempts, 0)),
      maxRetryBackoffMs: intValue(agent.max_retry_backoff_ms, 300000),
      maxConcurrentAgentsByState: maxByState,
      raw: resolveRawEnvRefs(agentSectionRaw),
    },
  };
}

export function validateForDispatch(config: ServiceConfig) {
  if (!config.tracker.kind) throw new Error("missing_tracker_kind: set tracker.kind in workflow");
  if (!config.agent.kind) throw new Error("missing_agent_kind: set agent.kind in workflow");
}
