/**
 * Token-based auth for MCP HTTP mode.
 * stdio mode is implicitly trusted (local process).
 */

import type { IncomingMessage } from "node:http";

/**
 * Verify the Bearer token from an HTTP request.
 * Returns true if the token matches or if no expected token is configured.
 */
export function verifyToken(req: IncomingMessage, expectedToken: string): boolean {
  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string") return false;

  if (!authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7).trim();
  return token === expectedToken;
}

/**
 * Simple in-memory token bucket for rate limiting.
 * Allows up to maxTokens requests per windowMs per token key.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly maxTokens: number;
  private readonly windowMs: number;

  constructor(maxTokens: number = 60, windowMs: number = 60_000) {
    this.maxTokens = maxTokens;
    this.windowMs = windowMs;
  }

  /**
   * Check and consume a token for the given key.
   * Returns true if allowed, false if rate limit exceeded.
   */
  consume(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (bucket.count >= this.maxTokens) {
      return false;
    }

    bucket.count++;
    return true;
  }
}
