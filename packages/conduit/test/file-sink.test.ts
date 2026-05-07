import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileLogSink } from "../src/logging/file-sink.js";
import { Logger } from "../src/logging/logger.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(path.join(tmpdir(), "conduit-sink-")); });

describe("FileLogSink", () => {
  it("creates the file and writes lines to it", () => {
    const file = path.join(tmp, "logs", "last-run.ndjson");
    const sink = new FileLogSink(file);
    sink.write("hello\n");
    sink.write("world\n");
    expect(readFileSync(file, "utf8")).toBe("hello\nworld\n");
  });

  it("truncates an existing file on construction so each run starts fresh", () => {
    const file = path.join(tmp, "last-run.ndjson");
    const first = new FileLogSink(file);
    first.write("from-run-one\n");
    const second = new FileLogSink(file);
    second.write("from-run-two\n");
    expect(readFileSync(file, "utf8")).toBe("from-run-two\n");
  });

  it("rotates to .1.ndjson when exceeding the byte cap", () => {
    const file = path.join(tmp, "last-run.ndjson");
    const sink = new FileLogSink(file, 32);
    sink.write("line-1-aaaaaaaaaaaaaaaa\n"); // ~25 bytes
    sink.write("line-2-bbbbbbbbbbbbbbbb\n"); // pushes past 32, triggers rotate
    expect(existsSync(path.join(tmp, "last-run.1.ndjson"))).toBe(true);
    expect(readFileSync(path.join(tmp, "last-run.1.ndjson"), "utf8")).toContain("line-1");
    expect(readFileSync(file, "utf8")).toContain("line-2");
  });

  it("does not throw when the parent directory cannot be created", () => {
    // Pointing the sink into a path under an existing file forces mkdir to fail; the sink should swallow it.
    const blocker = path.join(tmp, "blocker");
    writeFileSync(blocker, "x");
    const sink = new FileLogSink(path.join(blocker, "child", "log.ndjson"));
    expect(() => sink.write("ignored\n")).not.toThrow();
  });
});

describe("Logger with FileLogSink", () => {
  it("appends a JSON line per logger call to the sink file", () => {
    const file = path.join(tmp, "last-run.ndjson");
    const sink = new FileLogSink(file);
    const logger = new Logger("info", sink);
    logger.info("hello", { issue: "A-1" });
    logger.warn("careful", { code: 7 });
    const contents = readFileSync(file, "utf8").trim().split("\n");
    expect(contents).toHaveLength(2);
    const first = JSON.parse(contents[0]!);
    expect(first.message).toBe("hello");
    expect(first.issue).toBe("A-1");
    expect(first.level).toBe("info");
  });

  it("respects the level filter so debug lines never reach the sink at info level", () => {
    const file = path.join(tmp, "last-run.ndjson");
    const sink = new FileLogSink(file);
    const logger = new Logger("info", sink);
    logger.debug("noisy");
    logger.info("kept");
    const contents = readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
    expect(contents).toHaveLength(1);
    expect(JSON.parse(contents[0]!).message).toBe("kept");
  });

  it("does not break logging when no sink is provided", () => {
    const logger = new Logger("info");
    expect(() => logger.info("ok")).not.toThrow();
  });
});

