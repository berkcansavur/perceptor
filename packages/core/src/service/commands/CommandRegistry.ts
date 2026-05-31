import type { CommandHandler } from "./CommandHandler";
import { UnknownActionException } from "../exception";

// Routes an action to its handler. Replaces the dispatch switch with an O(1)
// polymorphic lookup; an unknown action throws so the funnel maps it uniformly.
export class CommandRegistry {
  private readonly byAction = new Map<string, CommandHandler>();

  constructor(handlers: readonly CommandHandler[]) {
    for (const handler of handlers) {
      this.byAction.set(handler.action, handler);
    }
  }

  dispatch(action: string, payload: Record<string, unknown>): Promise<unknown> | unknown {
    const handler = this.byAction.get(action);
    if (!handler) {
      throw new UnknownActionException(action);
    }
    return handler.handle(payload);
  }
}
