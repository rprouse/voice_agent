// Typed errors so each front end can word them its own way.

export type AppErrorCode =
  | "invalid-config"
  | "missing-api-key"
  | "auth-failed"
  | "agent-not-found"
  | "mic-denied"
  | "network"
  | "disconnected"
  | "unknown";

export class AppError extends Error {
  override readonly name = "AppError";

  constructor(
    readonly code: AppErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }

  static from(err: unknown, fallback: AppErrorCode = "unknown"): AppError {
    if (err instanceof AppError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new AppError(fallback, message, { cause: err });
  }
}
