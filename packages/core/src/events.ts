// A tiny typed event emitter. Node's EventEmitter is not available in the webview.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- listener argument lists vary per event
type EventMap = Record<string, (...args: any[]) => void>;

export class TypedEmitter<Events extends EventMap> {
  readonly #listeners = new Map<keyof Events, Set<Events[keyof Events]>>();

  /** Subscribes to an event and returns a function that unsubscribes. */
  on<E extends keyof Events>(event: E, listener: Events[E]): () => void {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /**
   * Calls every listener for the event. A listener that throws doesn't stop the others;
   * its error is passed to `onListenerError`.
   */
  protected emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(...args);
      } catch (err) {
        this.onListenerError(err);
      }
    }
  }

  protected onListenerError(_err: unknown): void {
    // Subclasses may report this; by default a faulty listener is ignored.
  }
}
