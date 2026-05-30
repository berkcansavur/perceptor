import type { AppEvents } from "./types";

type Listener<T> = (payload: T) => void;

// Minimal typed pub/sub so components stay decoupled (Observer pattern).
export class Emitter {
  private readonly listeners = new Map<keyof AppEvents, Set<Listener<unknown>>>();

  on<K extends keyof AppEvents>(event: K, listener: Listener<AppEvents[K]>): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
  }

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const listener of set) {
      (listener as Listener<AppEvents[K]>)(payload);
    }
  }
}
