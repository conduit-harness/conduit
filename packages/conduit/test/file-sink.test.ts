import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { FileLogSink } from "../src/logging/file-sink.js";
import { Logger } from "../src/logging/logger.js";
import { buildConfig } from "../src/config/workflow.js";

const workflowBase = { path: "WORKFLOW.md", promptTemplate: "" };
const repoPath = tmpdir();

describe("logs.root config resolution", () => {
  it("defaults to .conduit/logs resolved against repoPath", () => {
    const config = buildConfig({ ...workflowBase, config: {} }, repoPath);
    expect(config.logs.root).toBe(join(repoPath, ".conduit/logs"));
  });

  it("resolves a relative logs.root override against repoPath", () => {
    const config = buildConfig({ ...workflowBase, config: { logs: { root: "my-logs" } } }, repoPath);
    expect(config.logs.root).toBe(join(repoPath, "my-logs"));
  });

  it("keeps an absolute logs.root override unchanged", () => {
    const absPath = join(tmpdir(), "conduit-abs-logs-test");
    const config = buildConfig({ ...workflowBase, config: { logs: { root: absPath } } }, repoPath);
    expect(config.logs.root).toBe(resolve(repoPath, absPath));
  });
});

describe("FileLogSink", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `conduit-sink-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("logPath is last-run.ndjson inside logsRoot", () => {
    const sink = new FileLogSink(join(tmpDir, "logs"));
    expect(sink.logPath).toBe(join(tmpDir, "logs", "last-run.ndjson"));
  });

  it("creates log file and parent directories on first write", () => {
    const sink = new FileLogSink(join(tmpDir, "nested", "logs"));
    expect(existsSync(sink.logPath)).toBe(false);
    sink.write({ ts: "t", level: "info", message: "hello" });
    expect(existsSync(sink.logPath)).toBe(true);
  });

  it("writes NDJSON records one per line", () => {
    const sink = new FileLogSink(tmpDir);
    sink.write({ ts: "t1", level: "info", message: "first" });
    sink.write({ ts: "t2", level: "warn", message: "second" });
    const lines = readFileSync(sink.logPath, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ message: "first" });
    expect(JSON.parse(lines[1]!)).toMatchObject({ message: "second" });
  });

  it("truncates the log file when a new sink instance initializes", () => {
    const sink1 = new FileLogSink(tmpDir);
    sink1.write({ level: "info", message: "run1" });

    const sink2 = new FileLogSink(tmpDir);
    sink2.write({ level: "info", message: "run2" });

    const lines = readFileSync(sink2.logPath, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ message: "run2" });
  });
});

describe("Logger with FileLogSink (--no-log-file behavior)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `conduit-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("writes log records to file when sink is provided", () => {
    const sink = new FileLogSink(tmpDir);
    const logger = new Logger("info", sink);
    logger.info("test message", { key: "value" });
    expect(existsSync(sink.logPath)).toBe(true);
    const record = JSON.parse(readFileSync(sink.logPath, "utf8").trim());
    expect(record).toMatchObject({ level: "info", message: "test message", key: "value" });
  });

  it("does not create a log file when no sink is provided (--no-log-file)", () => {
    const expectedPath = join(tmpDir, "last-run.ndjson");
    const logger = new Logger("info");
    logger.info("test message");
    expect(existsSync(expectedPath)).toBe(false);
  });

  it("respects log level filter — below-threshold messages are not written to sink", () => {
    const sink = new FileLogSink(tmpDir);
    const logger = new Logger("warn", sink);
    logger.debug("should be filtered");
    logger.info("should be filtered");
    expect(existsSync(sink.logPath)).toBe(false);
    logger.warn("should appear");
    const lines = readFileSync(sink.logPath, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ message: "should appear" });
  });
});

describe("conduit report: no log file message", () => {
  it("log path is missing when no run has occurred", () => {
    const nonExistentRoot = join(tmpdir(), `conduit-nolog-${Date.now()}`);
    const expectedPath = join(nonExistentRoot, "last-run.ndjson");
    expect(existsSync(expectedPath)).toBe(false);
  });
});
