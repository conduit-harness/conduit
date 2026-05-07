import { describe, it, expect } from "vitest";
import { redactString, redactRecord, redactNdjson, trimLog } from "../src/reporting/redact.js";
import { buildReport, summarizeLog, formatIssueBody, buildIssueUrl } from "../src/reporting/report.js";

describe("redactString", () => {
  it("masks a GitHub token shape", () => {
    const out = redactString("authorization: ghp_abcdefghijklmnopqrstuvwxyz12");
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz12");
    expect(out).toContain("<redacted>");
  });

  it("masks an Anthropic token shape", () => {
    const out = redactString("sk-ant-api03-xyz1234567890abcdefghij");
    expect(out).toContain("<redacted>");
  });

  it("masks a Slack token shape", () => {
    const out = redactString("xoxb-1234-5678-AAAAbbbbCCCC");
    expect(out).toContain("<redacted>");
  });

  it("replaces home directory path with ~", () => {
    const out = redactString("file:///home/alice/work/log", { homeDir: "/home/alice" });
    expect(out).toContain("~");
    expect(out).not.toContain("/home/alice");
  });

  it("replaces workspace root with <workspace>", () => {
    const out = redactString("path /tmp/wks/run/log.txt error", { workspaceRoot: "/tmp/wks" });
    expect(out).toContain("<workspace>");
    expect(out).not.toContain("/tmp/wks");
  });

  it("normalizes windows-style separators when matching", () => {
    const out = redactString("C:\\Users\\Tom\\work\\file.log", { homeDir: "C:\\Users\\Tom" });
    expect(out).toContain("~");
  });
});

describe("redactRecord", () => {
  it("masks values for sensitive keys regardless of value content", () => {
    const out = redactRecord({ token: "anything", api_key: "abc", normal: "fine" });
    expect(out["token"]).toBe("<redacted>");
    expect(out["api_key"]).toBe("<redacted>");
    expect(out["normal"]).toBe("fine");
  });

  it("matches sensitive keys case-insensitively", () => {
    const out = redactRecord({ Authorization: "Bearer x", PASSWORD: "p" });
    expect(out["Authorization"]).toBe("<redacted>");
    expect(out["PASSWORD"]).toBe("<redacted>");
  });

  it("recurses into nested objects", () => {
    const out = redactRecord({ headers: { cookie: "xxx", "x-trace": "ok" } });
    expect((out["headers"] as Record<string, string>)["cookie"]).toBe("<redacted>");
    expect((out["headers"] as Record<string, string>)["x-trace"]).toBe("ok");
  });
});

describe("trimLog", () => {
  it("returns input unchanged when within limits", () => {
    expect(trimLog("a\nb\nc", 5, 5)).toBe("a\nb\nc");
  });

  it("keeps head + tail and inserts a marker for the omitted middle", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line${i}`).join("\n");
    const out = trimLog(lines, 3, 3);
    expect(out).toContain("line0");
    expect(out).toContain("line2");
    expect(out).toContain("line199");
    expect(out).toMatch(/redacted/);
    expect(out.split("\n").length).toBe(3 + 1 + 3);
  });
});

describe("redactNdjson", () => {
  it("redacts sensitive fields per record while keeping non-sensitive ones", () => {
    const input = [
      JSON.stringify({ ts: "now", level: "info", message: "ok", token: "ghs_secret_token_value_aaaaaaaa" }),
      JSON.stringify({ ts: "now", level: "info", message: "second", normal: "fine" }),
    ].join("\n");
    const out = redactNdjson(input);
    expect(out).toContain("<redacted>");
    expect(out).toContain("\"normal\":\"fine\"");
  });

  it("preserves non-JSON lines verbatim apart from token redaction", () => {
    const input = "not json line ghp_abcdefghijklmnopqrstuvwxyz12";
    const out = redactNdjson(input);
    expect(out).toContain("<redacted>");
  });

  it("preserves blank lines", () => {
    const out = redactNdjson("\n\n");
    expect(out).toBe("\n\n");
  });
});

describe("summarizeLog", () => {
  it("counts agent dispatches and captures the first tracker/runner kinds it sees", () => {
    const lines = [
      JSON.stringify({ ts: "1", level: "info", message: "run starting", tracker: "linear", agent: "claude-cli" }),
      JSON.stringify({ ts: "2", level: "info", message: "agent starting", issue: "X-1" }),
      JSON.stringify({ ts: "3", level: "info", message: "agent starting", issue: "X-2" }),
      JSON.stringify({ ts: "4", level: "error", message: "agent finished", error: "boom" }),
    ].join("\n");
    const summary = summarizeLog(lines, "9.9.9");
    expect(summary.attempts).toBe(2);
    expect(summary.trackerKind).toBe("linear");
    expect(summary.runnerKind).toBe("claude-cli");
    expect(summary.lastError).toBe("boom");
    expect(summary.conduitVersion).toBe("9.9.9");
  });

  it("returns zeros and nulls for an empty log", () => {
    const summary = summarizeLog("", "0.0.0");
    expect(summary.attempts).toBe(0);
    expect(summary.runnerKind).toBeNull();
    expect(summary.lastError).toBeNull();
  });
});

describe("formatIssueBody", () => {
  it("includes the redacted log block when log content is present", () => {
    const summary = summarizeLog("", "1.2.3");
    const body = formatIssueBody(summary, "redacted log lines here");
    expect(body).toContain("Run summary");
    expect(body).toContain("Last run log (redacted)");
    expect(body).toContain("redacted log lines here");
  });

  it("omits the log block when there is no log content", () => {
    const summary = summarizeLog("", "1.2.3");
    const body = formatIssueBody(summary, "");
    expect(body).toContain("No `.conduit/logs/last-run.ndjson` was found");
  });
});

describe("buildIssueUrl", () => {
  it("targets the conduit-harness/conduit issue form with prefilled fields", () => {
    const summary = summarizeLog("", "1.0.0");
    const url = buildIssueUrl(summary, "body text", { domain: "Core", type: "Bug", title: "Help" });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("github.com");
    expect(parsed.pathname).toBe("/conduit-harness/conduit/issues/new");
    expect(parsed.searchParams.get("template")).toBe("issue.yml");
    expect(parsed.searchParams.get("domain")).toBe("Core");
    expect(parsed.searchParams.get("type")).toBe("Bug");
    expect(parsed.searchParams.get("title")).toBe("Help");
    expect(parsed.searchParams.get("description")).toBe("body text");
  });
});

describe("buildReport", () => {
  it("redacts tokens and home/workspace paths from the embedded log", () => {
    const ndjson = [
      JSON.stringify({ ts: "1", level: "info", message: "run starting", tracker: "github", agent: "codex-cli" }),
      JSON.stringify({ ts: "2", level: "info", message: "agent starting", workspace: "/home/alice/repo/.conduit/wks/1/attempt-1", token: "ghp_abcdefghijklmnopqrstuvwxyz12" }),
    ].join("\n");
    const report = buildReport({
      rawLog: ndjson,
      logExists: true,
      conduitVersion: "1.0.0",
      options: { homeDir: "/home/alice", workspaceRoot: "/home/alice/repo" },
    });
    expect(report.body).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz12");
    expect(report.body).not.toContain("/home/alice");
    expect(report.body).toContain("<workspace>");
    expect(report.summary.trackerKind).toBe("github");
    expect(report.summary.runnerKind).toBe("codex-cli");
    expect(report.summary.attempts).toBe(1);
    expect(report.url).toContain("template=issue.yml");
  });
});
