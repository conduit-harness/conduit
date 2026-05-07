export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSink = { write(record: Record<string, unknown>): void };
const rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  constructor(private readonly level: LogLevel = "info", private readonly sink?: LogSink) {}
  child(fields: Record<string, unknown>): Logger {
    return new ChildLogger(this, fields);
  }
  debug(message: string, fields: Record<string, unknown> = {}) { this.emit("debug", message, fields); }
  info(message: string, fields: Record<string, unknown> = {}) { this.emit("info", message, fields); }
  warn(message: string, fields: Record<string, unknown> = {}) { this.emit("warn", message, fields); }
  error(message: string, fields: Record<string, unknown> = {}) { this.emit("error", message, fields); }
  protected emit(level: LogLevel, message: string, fields: Record<string, unknown>) {
    if (rank[level] < rank[this.level]) return;
    const record = { ts: new Date().toISOString(), level, message, ...fields };
    const line = JSON.stringify(record);
    if (level === "error") console.error(line); else console.log(line);
    this.sink?.write(record);
  }
}

class ChildLogger extends Logger {
  constructor(private readonly parent: Logger, private readonly fields: Record<string, unknown>) { super("debug"); }
  protected override emit(level: LogLevel, message: string, fields: Record<string, unknown>) {
    (this.parent as unknown as { emit(level: LogLevel, message: string, fields: Record<string, unknown>): void }).emit(level, message, { ...this.fields, ...fields });
  }
}
