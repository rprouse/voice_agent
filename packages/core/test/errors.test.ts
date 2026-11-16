import { describe, expect, it } from "vitest";
import { AppError } from "../src/index.ts";

describe("AppError.from", () => {
  it("returns an AppError unchanged", () => {
    const original = new AppError("auth-failed", "bad key");
    expect(AppError.from(original)).toBe(original);
  });

  it("wraps other errors with the fallback code and keeps the cause", () => {
    const cause = new TypeError("Failed to fetch");
    const wrapped = AppError.from(cause, "network");
    expect(wrapped.code).toBe("network");
    expect(wrapped.message).toBe("Failed to fetch");
    expect(wrapped.cause).toBe(cause);
  });

  it("wraps non-Error values as unknown", () => {
    const wrapped = AppError.from("oops");
    expect(wrapped.code).toBe("unknown");
    expect(wrapped.message).toBe("oops");
  });
});
