import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ServiceConfig } from "@conduit-harness/conduit";
import ForgejoTrackerClient from "../src/index.js";

describe("ForgejoTrackerClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ForgejoTrackerClient;
  const config: ServiceConfig = {
    tracker: {
      kind: "forgejo",
      pageSize: 10,
      requiredLabels: ["agentic"],
      excludedLabels: ["blocked"],
      terminalStates: ["closed"],
      raw: {
        base_url: "https://forgejo.example.com",
        owner: "test-org",
        repo: "test-repo",
        api_key: "test-token",
      },
    },
  } as never;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new ForgejoTrackerClient(config, mockFetch);
  });

  describe("fetchCandidateIssues", () => {
    it("fetches open issues with required labels", async () => {
      const mockIssues = [
        {
          number: 1,
          title: "Test issue",
          body: "Description",
          state: "open",
          html_url: "https://forgejo.example.com/test-org/test-repo/issues/1",
          labels: [{ name: "agentic" }],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockIssues), { status: 200 })
      );

      const issues = await client.fetchCandidateIssues();

      expect(issues).toHaveLength(1);
      expect(issues[0].identifier).toBe("#1");
      expect(issues[0].title).toBe("Test issue");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/repos/test-org/test-repo/issues"),
        expect.any(Object)
      );
    });

    it("filters out pull requests", async () => {
      const mockIssues = [
        {
          number: 1,
          title: "Real issue",
          body: null,
          state: "open",
          html_url: "https://forgejo.example.com/test-org/test-repo/issues/1",
          labels: [{ name: "agentic" }],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          pull_request: {},
        },
        {
          number: 2,
          title: "Another issue",
          body: null,
          state: "open",
          html_url: "https://forgejo.example.com/test-org/test-repo/issues/2",
          labels: [{ name: "agentic" }],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockIssues), { status: 200 })
      );

      const issues = await client.fetchCandidateIssues();

      expect(issues).toHaveLength(1);
      expect(issues[0].identifier).toBe("#2");
    });

    it("filters by excluded labels", async () => {
      const mockIssues = [
        {
          number: 1,
          title: "Blocked issue",
          body: null,
          state: "open",
          html_url: "https://forgejo.example.com/test-org/test-repo/issues/1",
          labels: [{ name: "agentic" }, { name: "blocked" }],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockIssues), { status: 200 })
      );

      const issues = await client.fetchCandidateIssues();

      expect(issues).toHaveLength(0);
    });

    it("handles pagination", async () => {
      const page1 = Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        title: `Issue ${i + 1}`,
        body: null,
        state: "open",
        html_url: `https://forgejo.example.com/test-org/test-repo/issues/${i + 1}`,
        labels: [{ name: "agentic" }],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }));

      const page2 = [
        {
          number: 11,
          title: "Issue 11",
          body: null,
          state: "open",
          html_url: "https://forgejo.example.com/test-org/test-repo/issues/11",
          labels: [{ name: "agentic" }],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];

      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

      const issues = await client.fetchCandidateIssues();

      expect(issues).toHaveLength(11);
    });
  });

  describe("fetchIssuesByStates", () => {
    it("fetches open issues for non-terminal states", async () => {
      const mockIssues = [
        {
          number: 1,
          title: "Open issue",
          body: null,
          state: "open",
          html_url: "https://forgejo.example.com/test-org/test-repo/issues/1",
          labels: [{ name: "agentic" }],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockIssues), { status: 200 })
      );

      const issues = await client.fetchIssuesByStates(["open"]);

      expect(issues).toHaveLength(1);
    });

    it("fetches both open and closed issues when requested", async () => {
      const openIssues = [
        {
          number: 1,
          title: "Open issue",
          body: null,
          state: "open",
          html_url: "https://forgejo.example.com/test-org/test-repo/issues/1",
          labels: [{ name: "agentic" }],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];

      const closedIssues = [
        {
          number: 2,
          title: "Closed issue",
          body: null,
          state: "closed",
          html_url: "https://forgejo.example.com/test-org/test-repo/issues/2",
          labels: [{ name: "agentic" }],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];

      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify(openIssues), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(closedIssues), { status: 200 }));

      const issues = await client.fetchIssuesByStates(["open", "closed"]);

      expect(issues).toHaveLength(2);
    });
  });

  describe("fetchIssueStatesByIds", () => {
    it("fetches states for given issue IDs", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              number: 1,
              title: "Issue 1",
              body: null,
              state: "open",
              html_url: "https://forgejo.example.com/test-org/test-repo/issues/1",
              labels: [],
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              number: 2,
              title: "Issue 2",
              body: null,
              state: "closed",
              html_url: "https://forgejo.example.com/test-org/test-repo/issues/2",
              labels: [],
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            }),
            { status: 200 }
          )
        );

      const states = await client.fetchIssueStatesByIds(["1", "2"]);

      expect(states).toEqual({ "1": "open", "2": "closed" });
    });

    it("returns empty object for empty list", async () => {
      const states = await client.fetchIssueStatesByIds([]);

      expect(states).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("comment", () => {
    it("posts a comment to an issue", async () => {
      mockFetch.mockResolvedValueOnce(new Response("{}", { status: 201 }));

      await client.comment("1", "Test comment");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/repos/test-org/test-repo/issues/1/comments"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "content-type": "application/json" }),
          body: JSON.stringify({ body: "Test comment" }),
        })
      );
    });
  });

  describe("transition", () => {
    it("closes an issue for terminal states", async () => {
      mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

      await client.transition("1", "closed");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/repos/test-org/test-repo/issues/1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ state: "closed" }),
        })
      );
    });

    it("reopens an issue for non-terminal states", async () => {
      mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

      await client.transition("1", "in-progress");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/repos/test-org/test-repo/issues/1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ state: "open" }),
        })
      );
    });
  });

  describe("error handling", () => {
    it("throws on missing base_url", () => {
      const badConfig: ServiceConfig = {
        tracker: {
          kind: "forgejo",
          pageSize: 10,
          requiredLabels: [],
          excludedLabels: [],
          terminalStates: [],
          raw: {
            base_url: "",
            owner: "test",
            repo: "test",
          },
        },
      } as never;

      expect(() => new ForgejoTrackerClient(badConfig, mockFetch)).toThrow(
        "forgejo_missing_base_url"
      );
    });

    it("throws on API errors", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", { status: 404 }));

      await expect(client.fetchCandidateIssues()).rejects.toThrow("forgejo_api_status");
    });

    it("throws on network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.fetchCandidateIssues()).rejects.toThrow("forgejo_api_request");
    });
  });
});
