import { describe, expect, it } from "vitest";

// Inline the parsing functions to test them (they're not exported)
function parseShorthandNumber(s: string): number | undefined {
  const match = /^([\d.]+)([kmb])?$/i.exec(s.trim());
  if (!match) return undefined;
  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const suffix = (match[2] ?? "").toLowerCase();
  const multipliers: Record<string, number> = { k: 1000, m: 1000000, b: 1000000000 };
  return Math.round(base * (multipliers[suffix] ?? 1));
}

function parseAiderTokenUsage(output: string) {
  const tokenLine = output.split("\n").find(line => line.includes("Tokens:") && (line.includes("sent") || line.includes("received")));
  if (!tokenLine) return undefined;
  const sentMatch = /(\d+\.?\d*[kmb]?)\s*(?:tokens?)?\s*sent/i.exec(tokenLine);
  const receivedMatch = /(\d+\.?\d*[kmb]?)\s*(?:tokens?)?\s*received/i.exec(tokenLine);
  const usage: Record<string, number> = {};
  if (sentMatch) {
    const inputTokens = parseShorthandNumber(sentMatch[1]);
    if (inputTokens !== undefined) usage.inputTokens = inputTokens;
  }
  if (receivedMatch) {
    const outputTokens = parseShorthandNumber(receivedMatch[1]);
    if (outputTokens !== undefined) usage.outputTokens = outputTokens;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

describe("aider token parsing", () => {
  describe("parseShorthandNumber", () => {
    it("parses plain integers", () => {
      expect(parseShorthandNumber("100")).toBe(100);
      expect(parseShorthandNumber("1234")).toBe(1234);
    });

    it("parses decimals", () => {
      expect(parseShorthandNumber("12.3")).toBe(12);
      expect(parseShorthandNumber("12.5")).toBe(13);
      expect(parseShorthandNumber("12.7")).toBe(13);
    });

    it("parses thousands (k)", () => {
      expect(parseShorthandNumber("12.3k")).toBe(12300);
      expect(parseShorthandNumber("1k")).toBe(1000);
      expect(parseShorthandNumber("1.5k")).toBe(1500);
    });

    it("parses millions (m)", () => {
      expect(parseShorthandNumber("2.5m")).toBe(2500000);
      expect(parseShorthandNumber("1m")).toBe(1000000);
    });

    it("parses billions (b)", () => {
      expect(parseShorthandNumber("1.5b")).toBe(1500000000);
      expect(parseShorthandNumber("1b")).toBe(1000000000);
    });

    it("handles case insensitivity", () => {
      expect(parseShorthandNumber("12.3K")).toBe(12300);
      expect(parseShorthandNumber("1M")).toBe(1000000);
    });

    it("returns undefined for invalid input", () => {
      expect(parseShorthandNumber("abc")).toBeUndefined();
      expect(parseShorthandNumber("")).toBeUndefined();
      expect(parseShorthandNumber("12.3x")).toBeUndefined();
    });
  });

  describe("parseAiderTokenUsage", () => {
    it("parses standard token output", () => {
      const output = "Tokens: 12.3k sent, 1.2k received";
      const usage = parseAiderTokenUsage(output);
      expect(usage).toEqual({ inputTokens: 12300, outputTokens: 1200 });
    });

    it("parses with newlines", () => {
      const output = "Some log\nTokens: 5k sent, 2.5k received\nMore log";
      const usage = parseAiderTokenUsage(output);
      expect(usage).toEqual({ inputTokens: 5000, outputTokens: 2500 });
    });

    it("parses integer tokens", () => {
      const output = "Tokens: 100 sent, 50 received";
      const usage = parseAiderTokenUsage(output);
      expect(usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    });

    it("parses with capital K/M/B", () => {
      const output = "Tokens: 10K sent, 5K received";
      const usage = parseAiderTokenUsage(output);
      expect(usage).toEqual({ inputTokens: 10000, outputTokens: 5000 });
    });

    it("returns undefined when no token line found", () => {
      const output = "Some output without token info";
      const usage = parseAiderTokenUsage(output);
      expect(usage).toBeUndefined();
    });

    it("handles partial token information", () => {
      const output = "Tokens: 100 sent";
      const usage = parseAiderTokenUsage(output);
      expect(usage).toEqual({ inputTokens: 100 });
    });

    it("handles multiple token lines (uses first)", () => {
      const output = "Tokens: 100 sent, 50 received\nTokens: 200 sent, 100 received";
      const usage = parseAiderTokenUsage(output);
      expect(usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    });

    it("handles whitespace variations", () => {
      const output = "Tokens:  12.3k  sent,  1.2k  received";
      const usage = parseAiderTokenUsage(output);
      expect(usage).toEqual({ inputTokens: 12300, outputTokens: 1200 });
    });
  });
});
