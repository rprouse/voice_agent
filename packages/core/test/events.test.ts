import { describe, expect, it, vi } from "vitest";
import { TypedEmitter } from "../src/index.ts";

type TestEvents = {
  ping: (n: number) => void;
  done: () => void;
};

class TestEmitter extends TypedEmitter<TestEvents> {
  errors: unknown[] = [];
  fire<E extends keyof TestEvents>(event: E, ...args: Parameters<TestEvents[E]>) {
    this.emit(event, ...args);
  }
  protected override onListenerError(err: unknown) {
    this.errors.push(err);
  }
}

describe("TypedEmitter", () => {
  it("delivers arguments to every listener", () => {
    const emitter = new TestEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on("ping", a);
    emitter.on("ping", b);
    emitter.fire("ping", 42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });

  it("stops delivering after unsubscribe", () => {
    const emitter = new TestEmitter();
    const listener = vi.fn();
    const off = emitter.on("done", listener);
    off();
    emitter.fire("done");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps calling other listeners when one throws", () => {
    const emitter = new TestEmitter();
    const after = vi.fn();
    emitter.on("done", () => {
      throw new Error("boom");
    });
    emitter.on("done", after);
    emitter.fire("done");
    expect(after).toHaveBeenCalledOnce();
    expect(emitter.errors).toHaveLength(1);
  });

  it("does nothing for an event with no listeners", () => {
    const emitter = new TestEmitter();
    expect(() => {
      emitter.fire("done");
    }).not.toThrow();
  });
});
