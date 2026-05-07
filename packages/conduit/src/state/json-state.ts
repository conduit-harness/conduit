import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PersistedState, RunAttempt } from "../domain/types.js";

export class JsonStateStore {
  readonly filePath: string;
  constructor(root: string) { this.filePath = path.join(root, "runtime.json"); }
  async load(): Promise<PersistedState> {
    try { return JSON.parse(await readFile(this.filePath, "utf8")) as PersistedState; }
    catch { return { version: 1, attempts: [], completedIssueIds: [], retryAttempts: {} }; }
  }
  async save(state: PersistedState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, this.filePath);
  }
  async upsertAttempt(attempt: RunAttempt): Promise<void> {
    const s = await this.load();
    const idx = s.attempts.findIndex(a => a.issueId === attempt.issueId && a.attempt === attempt.attempt);
    if (idx >= 0) s.attempts[idx] = attempt;
    else s.attempts.push(attempt);
    if (attempt.status === "succeeded" && !s.completedIssueIds.includes(attempt.issueId)) {
      s.completedIssueIds.push(attempt.issueId);
    }
    await this.save(s);
  }
  async recoverStaleAttempts(maxAgeMs: number): Promise<RunAttempt[]> {
    const s = await this.load();
    const now = Date.now();
    const recovered: RunAttempt[] = [];
    for (const a of s.attempts) {
      if (a.status !== "running") continue;
      const age = now - new Date(a.startedAt).getTime();
      if (!Number.isFinite(age) || age <= maxAgeMs) continue;
      a.status = "failed";
      a.finishedAt = new Date().toISOString();
      a.error = `Recovered as stale after ${Math.round(age / 1000)}s — the prior process did not record completion.`;
      recovered.push(a);
    }
    if (recovered.length > 0) await this.save(s);
    return recovered;
  }
}
