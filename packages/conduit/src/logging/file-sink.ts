import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LogSink } from "./logger.js";

export class FileLogSink implements LogSink {
  private readonly _logPath: string;
  private initialized = false;

  constructor(logsRoot: string) {
    this._logPath = path.join(logsRoot, "last-run.ndjson");
  }

  get logPath(): string { return this._logPath; }

  write(record: Record<string, unknown>): void {
    if (!this.initialized) {
      mkdirSync(path.dirname(this._logPath), { recursive: true });
      writeFileSync(this._logPath, "");
      this.initialized = true;
    }
    appendFileSync(this._logPath, JSON.stringify(record) + "\n");
  }
}
