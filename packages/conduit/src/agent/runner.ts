import type { RunAttempt } from "../domain/types.js";

export type AgentUsage = { inputTokens: number; outputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number };
export type AgentResult = { status: "succeeded" | "failed" | "timed_out"; exitCode?: number; output: string; error?: string; summary?: string; usage?: AgentUsage; fullLog?: string };
export interface AgentRunner { run(attempt: RunAttempt, prompt: string): Promise<AgentResult>; preflightAuth?(): Promise<void>; }

export class FakeAgentRunner implements AgentRunner {
  async run(_attempt: RunAttempt, prompt: string): Promise<AgentResult> { return { status: "succeeded", output: `fake agent received ${prompt.length} chars` }; }
}
