import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { NotFoundError, ValidationError } from "@schema-studio/core";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid input", detail: err.flatten() },
    });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: err.message },
    });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: err.message, detail: err.detail },
    });
    return;
  }
  console.error("[api] Unhandled error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
}
