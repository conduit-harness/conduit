import { describe, expect, it } from "vitest";
import { redactLog, redactText } from "../src/cli/redact.js";
import { buildIssueUrl } from "../src/cli/report.js";

describe("redactLog", () => {
  it("masks fields whose key matches token/api_key/secret/password/cookie/authorization", () => {
    const ndjson = JSON.stringify({ ts: "t", level: "info", message: "hi", api_key: "abc", apiKey: "abc", token: "z", authorization: "Bearer z", cookie: "session=1", secret: "s", password: "p" });
    const out = redactLog(ndjson);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.api_key).toBe("<redacted>");
    expect(parsed.apiKey).toBe("<redacted>");
    expect(parsed.token).toBe("<redacted>");
    expect(parsed.authorization).toBe("<redacted>");
    expect(parsed.cookie).toBe("<redacted>");
    expect(parsed.secret).toBe("<redacted>");
    expect(parsed.password).toBe("<redacted>");
    expect(parsed.message).toBe("hi");
  });

  it("replaces home directory and workspace root paths", () => {
    const line = JSON.stringify({ ts: "t", level: "info", message: "/home/user/repo/.conduit/workspaces/issue-1/attempt-1/file.ts is at /home/user/notes" });
    const out = redactLog(line, { homeDir: "/home/user", workspaceRoot: "/home/user/repo/.conduit/workspaces" });
    expect(out).toContain("<workspace>/issue-1/attempt-1/file.ts");
    expect(out).toContain("~/notes");
    expect(out).not.toContain("/home/user");
  });

  it("masks well-known token shapes (gh, slack, anthropic, openai, jwt) in free text", () => {
    const samples = [
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "ghs_abcdefghijklmnopqrstuvwxyz0123456789",
      "xoxb-1234567890-abcdef",
      "sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaa",
      "sk-aaaaaaaaaaaaaaaaaaaaaaaa",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signaturepartyy",
    ];
    for (const sample of samples) {
      const out = redactText(`leak: ${sample} end`);
      expect(out).toBe("leak: <redacted> end");
    }
  });

  it("truncates very long input to head + tail with a marker", () => {
    const lines = Array.from({ length: 250 }, (_, i) => `line-${i}`);
    const out = redactLog(lines.join("\n"), { headLines: 5, tailLines: 5 });
    const split = out.split("\n");
    expect(split[0]).toBe("line-0");
    expect(split[4]).toBe("line-4");
    expect(split[5]).toContain("lines redacted");
    expect(split[6]).toBe("line-245");
    expect(split[10]).toBe("line-249");
  });

  it("redacts inside nested fullLog payloads", () => {
    const innerLog = ["start", "Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789", "end"].join("\n");
    const ndjson = JSON.stringify({ ts: "t", level: "info", message: "agent finished", fullLog: innerLog });
    const out = redactLog(ndjson);
    expect(out).toContain("<redacted>");
    expect(out).not.toContain("ghp_");
  });

  it("preserves non-JSON lines while still applying text redaction", () => {
    const text = "plain text line with sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaa here";
    expect(redactLog(text)).toBe("plain text line with <redacted> here");
  });
});

describe("buildIssueUrl", () => {
  it("links to the conduit-harness/conduit issues/new endpoint with the template prefilled", () => {
    const url = buildIssueUrl("Core", "Bug", "hello world");
    expect(url.startsWith("https://github.com/conduit-harness/conduit/issues/new?")).toBe(true);
    expect(url).toContain("template=issue.yml");
    expect(url).toContain("domain=Core");
    expect(url).toContain("type=Bug");
    expect(url).toContain("description=hello+world");
  });
});
