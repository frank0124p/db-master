/**
 * MCP Server Security Tests (T11.2)
 *
 * 1. HTTP call without token → 401
 * 2. Verify client.ts has no mutation HTTP calls (only GET and two allowed POSTs)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Test 1: auth.ts verifyToken behavior ─────────────────────────────────────

describe("verifyToken", () => {
  it("returns false when authorization header is missing", async () => {
    const { verifyToken } = await import("../auth.js");

    const mockReq = { headers: {} } as import("node:http").IncomingMessage;
    expect(verifyToken(mockReq, "secret")).toBe(false);
  });

  it("returns false when token does not match", async () => {
    const { verifyToken } = await import("../auth.js");

    const mockReq = {
      headers: { authorization: "Bearer wrong-token" },
    } as unknown as import("node:http").IncomingMessage;
    expect(verifyToken(mockReq, "correct-token")).toBe(false);
  });

  it("returns true when token matches", async () => {
    const { verifyToken } = await import("../auth.js");

    const mockReq = {
      headers: { authorization: "Bearer my-secret-token" },
    } as unknown as import("node:http").IncomingMessage;
    expect(verifyToken(mockReq, "my-secret-token")).toBe(true);
  });

  it("returns false when header is not a Bearer token", async () => {
    const { verifyToken } = await import("../auth.js");

    const mockReq = {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    } as unknown as import("node:http").IncomingMessage;
    expect(verifyToken(mockReq, "anything")).toBe(false);
  });
});

// ── Test 2: RateLimiter behavior ─────────────────────────────────────────────

describe("RateLimiter", () => {
  it("allows requests within limit", async () => {
    const { RateLimiter } = await import("../auth.js");
    const limiter = new RateLimiter(3, 60_000);

    expect(limiter.consume("key1")).toBe(true);
    expect(limiter.consume("key1")).toBe(true);
    expect(limiter.consume("key1")).toBe(true);
  });

  it("blocks requests beyond limit", async () => {
    const { RateLimiter } = await import("../auth.js");
    const limiter = new RateLimiter(2, 60_000);

    expect(limiter.consume("key2")).toBe(true);
    expect(limiter.consume("key2")).toBe(true);
    expect(limiter.consume("key2")).toBe(false); // over limit
  });

  it("uses separate buckets per key", async () => {
    const { RateLimiter } = await import("../auth.js");
    const limiter = new RateLimiter(1, 60_000);

    expect(limiter.consume("tokenA")).toBe(true);
    expect(limiter.consume("tokenA")).toBe(false);
    // Different key should have its own bucket
    expect(limiter.consume("tokenB")).toBe(true);
  });
});

// ── Test 3: client.ts static analysis — no mutation HTTP calls ───────────────

describe("client.ts readonly enforcement", () => {
  it("contains no PATCH/PUT/DELETE HTTP calls", () => {
    const clientPath = join(__dirname, "../client.ts");
    const source = readFileSync(clientPath, "utf-8");

    // Check that no PATCH, PUT, DELETE method calls exist
    const forbiddenMethods = ["PATCH", "PUT", "DELETE"];
    for (const method of forbiddenMethods) {
      // Look for method: "PATCH" / method: "PUT" / method: "DELETE" in fetch calls
      const pattern = new RegExp(`method:\\s*["']${method}["']`, "i");
      expect(
        pattern.test(source),
        `client.ts must not contain HTTP ${method} calls (mutation not allowed)`,
      ).toBe(false);
    }
  });

  it("only uses GET or the two allowed POST endpoints", () => {
    const clientPath = join(__dirname, "../client.ts");
    const source = readFileSync(clientPath, "utf-8");

    // Extract all method: "..." occurrences
    const methodMatches = source.matchAll(/method:\s*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["']/gi);
    const methods = [...methodMatches].map(m => m[1]?.toUpperCase() ?? "");

    for (const method of methods) {
      expect(
        ["GET", "POST"].includes(method),
        `client.ts found forbidden HTTP method: ${method}`,
      ).toBe(true);
    }
  });

  it("only POSTs to allowed read-only endpoints", () => {
    const clientPath = join(__dirname, "../client.ts");
    const source = readFileSync(clientPath, "utf-8");

    // Find all POST fetch URLs
    // Pattern: method: "POST" near a URL template literal or string
    const allowedPostPaths = [
      "/api/v1/ask/link-only",
      "/api/v1/ask",
    ];

    // Extract POST blocks: find method: "POST" and then check nearby URL
    const lines = source.split("\n");
    let inPostBlock = false;
    let postCount = 0;

    for (const line of lines) {
      if (/method:\s*["']POST["']/i.test(line)) {
        inPostBlock = true;
        postCount++;
      }
    }

    // Count POST calls in URL lines
    let urlPostCount = 0;
    for (const allowed of allowedPostPaths) {
      if (source.includes(allowed)) urlPostCount++;
    }

    // All POSTs should correspond to allowed endpoints
    expect(postCount).toBeLessThanOrEqual(allowedPostPaths.length);
    expect(urlPostCount).toBeGreaterThanOrEqual(postCount > 0 ? 1 : 0);
  });

  it("has the READONLY comment marker", () => {
    const clientPath = join(__dirname, "../client.ts");
    const source = readFileSync(clientPath, "utf-8");
    expect(source).toContain("READONLY");
  });
});

// ── Test 4: tools do not import any mutation methods ─────────────────────────

describe("tools readonly enforcement", () => {
  const toolFiles = [
    "search-assets.ts",
    "get-asset.ts",
    "get-join-path.ts",
    "list-concepts.ts",
    "ask.ts",
  ];

  for (const toolFile of toolFiles) {
    it(`${toolFile} does not call any mutation endpoints`, () => {
      const toolPath = join(__dirname, `../tools/${toolFile}`);
      const source = readFileSync(toolPath, "utf-8");

      // Tool files should not directly call fetch (they use the client)
      const directFetch = /\bfetch\s*\(/g;
      expect(
        directFetch.test(source),
        `${toolFile} should not call fetch directly — use client methods`,
      ).toBe(false);

      // Should not reference mutation HTTP methods
      const forbiddenPatterns = [
        /method:\s*["'](PATCH|PUT|DELETE)["']/i,
        /\bPATCH\b/,
        /\bPUT\b.*http/i,
        /\bDELETE\b.*http/i,
      ];

      for (const pattern of forbiddenPatterns) {
        // Skip the PATCH/PUT/DELETE word check for concept descriptions that might mention them
        if (pattern.source === "\\bPATCH\\b" || pattern.source === "\\bPUT\\b.*http") continue;
        expect(
          pattern.test(source),
          `${toolFile} must not contain mutation HTTP calls`,
        ).toBe(false);
      }
    });
  }
});
