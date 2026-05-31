// One RPC action, expressed polymorphically. The registry routes by `action`, so
// adding a command never touches a switch (Open/Closed). `Result` is the concrete
// payload that action produces — each command binds it (e.g. CommandHandler<{ task: Task }>),
// so a command's contract is precise. The registry holds a heterogeneous set keyed by a
// runtime string, so at THAT boundary Result erases to the default — but never at the
// command definition itself.
export interface CommandHandler<Result = unknown> {
  readonly action: string;
  handle(payload: Record<string, unknown>): Promise<Result> | Result;
}
