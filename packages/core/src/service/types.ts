// Server-side domain types (tasks, scaffolding, auto-processor).

export type TaskStatus =
  | "pending"
  | "proposed"
  | "approved"
  | "applied"
  | "rejected"
  | "error"
  | "processing";

export type TaskMessage = {
  role: string;
  text: string;
  at: string;
}

export type TaskImpact = {
  risk: string;
  notes: string[];
}

export type TaskLock = {
  pid: number | null;
  startedAt: string;
}

export type AutoAttempt = {
  status: string;
  attempts: number;
}

// Tokens/cost a task has cost across all its headless Claude runs (accumulated).
export type TaskUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  runs: number;
  at: string;
}

// --- Endpoints: a task points at exactly one shape, so the type tells you which
// fields exist (no nullable "maybe class / maybe dir" bag). ---
export type BehaviorEndpoint = {
  class: string;
  file: string;
  behavior: string;
}

export type ClassFileEndpoint = {
  class: string;
  file: string;
}

export type DirectoryEndpoint = {
  dir: string;
}

export type TaskEndpoint = BehaviorEndpoint | ClassFileEndpoint | DirectoryEndpoint;

// --- Per-type specs: each task type carries exactly the parameters it needs. ---
export type ErrorHandlingMode = "throw" | "nullable" | "default";

export type ErrorHandling = {
  mode: ErrorHandlingMode;
  exception: string;
}

export type AddBehaviorSpec = {
  name: string;
  description: string;
  signature: string;
  errorHandling: ErrorHandling;
}

export type EditBehaviorSpec = {
  description: string;
  signature: string;
  line: number;
  endLine: number;
}

export type CreateFileSpec = {
  name: string;
  description: string;
}

export type CreateFolderSpec = {
  name: string;
}

export type RequestSpec = {
  description: string;
}

export type DescribeBehaviorSpec = {
  line: number;
  endLine: number;
  // A compact, deterministically-extracted control-flow outline (input/calls/branches/
  // returns/throws as indented text), built client-side by the analyzer — NOT by Claude.
  // Handed to the describe skill as the authoritative structure so it narrates the method
  // branch-by-branch without re-deriving control flow, keeping the run token-cheap. Empty
  // when the method has no extractable flow.
  flowOutline: string;
}

// --- TaskKind: type-discriminated "what the task targets". from/to/spec exist only
// where that type uses them, so `task.type` tells you the exact shape. ---
export type MoveBehaviorKind = {
  type: "move-behavior";
  from: BehaviorEndpoint;
  to: ClassFileEndpoint;
}
export type AddBehaviorKind = {
  type: "add-behavior";
  from: ClassFileEndpoint;
  spec: AddBehaviorSpec;
}
export type EditBehaviorKind = {
  type: "edit-behavior";
  from: BehaviorEndpoint;
  spec: EditBehaviorSpec;
}
export type CreateFileKind = {
  type: "create-file";
  from: DirectoryEndpoint;
  spec: CreateFileSpec;
}
export type CreateFolderKind = {
  type: "create-folder";
  from: DirectoryEndpoint;
  spec: CreateFolderSpec;
}
export type RequestKind = {
  type: "request";
  spec: RequestSpec;
}
export type DescribeBehaviorKind = {
  type: "describe-behavior";
  from: BehaviorEndpoint;
  spec: DescribeBehaviorSpec;
}
export type TaskKind =
  | MoveBehaviorKind
  | AddBehaviorKind
  | EditBehaviorKind
  | CreateFileKind
  | CreateFolderKind
  | RequestKind
  | DescribeBehaviorKind;

// The change artifact a run produced, discriminated by `kind`: a task that hasn't been
// proposed carries `none`, a proposal carries its diff + impact, and an applied change
// adds the commit message. The fields that exist are exactly those the stage has — no
// `diff: string | null` "maybe produced" trio. (describe-behavior applies with `none`.)
export type TaskArtifact =
  | { kind: "none" }
  | { kind: "proposed"; diff: string; impact: TaskImpact }
  | { kind: "applied"; diff: string; impact: TaskImpact; commitMessage: string };

export type TaskLifecycle = {
  status: TaskStatus;
  artifact: TaskArtifact;
}

// Identity + thread + host-side runtime bookkeeping. Runtime fields are orthogonal
// to status (a run can be in flight at any status); null means "no run yet".
export type TaskMeta = {
  id: string;
  dismissed: boolean;
  lock: TaskLock | null;
  auto: AutoAttempt | null;
  usage: TaskUsage | null;
  sessionId: string | null;
  messages: TaskMessage[];
  createdAt: string;
  updatedAt: string;
}

// A task is its target (by type) ∧ its lifecycle ∧ its metadata. Narrow on
// `task.type` to get the exact endpoints/spec — that's where the old nullable bag is gone.
export type Task = TaskKind & TaskLifecycle & TaskMeta;

export type EnqueuePayload = TaskKind;

// The webview sends exactly one update intent, discriminated by `intent`; each carries
// only the fields it sets — no nullable patch-bag where null means "leave unchanged".
export type SetStatusUpdate = { id: string; intent: "set-status"; status: TaskStatus };
export type ReplyUpdate = { id: string; intent: "reply"; message: string };
export type DismissUpdate = { id: string; intent: "dismiss" };
export type UpdatePayload = SetStatusUpdate | ReplyUpdate | DismissUpdate;

// Scaffolding request, discriminated by `kind`: a file carries its template + type name,
// a folder carries neither — so the shape tells you which fields exist, no nullable bag.
export type CreateFile = { kind: "file"; dir: string; name: string; template: string; typeName: string; goPackage: string };
export type CreateFolder = { kind: "folder"; dir: string; name: string };
export type CreatePayload = CreateFile | CreateFolder;

// An action that carries no request body. A concrete empty object (not `unknown`,
// not an index bag) so callers must pass `{}` and nothing else type-checks into it.
export type EmptyRequest = Record<string, never>;

// The request contract: every RPC action mapped to the EXACT shape its caller must send.
// The mirror of ApiContract (which maps each action to its result), so the channel is
// typed end to end — the webview can't post a malformed request, and each host Command
// binds its parsed input to ApiRequest[action]. The wire still arrives untyped (IPC), so
// each Command.parse validates a raw record into its entry here — but past that single
// boundary nothing is `Record<string, unknown>`.
export type ApiRequest = {
  graph: EmptyRequest;
  meta: EmptyRequest;
  reanalyze: EmptyRequest;
  fileTemplates: EmptyRequest;
  tasks: EmptyRequest;
  autoStatus: EmptyRequest;
  autoActivity: EmptyRequest;
  getPreferences: EmptyRequest;
  gitStatus: EmptyRequest;
  source: { file: string; from: number; to: number };
  browse: { path: string | null };
  open: { path: string };
  enqueueTask: EnqueuePayload;
  updateTask: UpdatePayload;
  editRequest: { id: string; description: string };
  editMessage: { id: string; index: number; description: string };
  deleteTask: { id: string };
  savePreferences: CodingPreferences;
  behaviorSummary: { file: string; behavior: string };
  complexity: { code: string; name: string; file?: string };
  create: CreatePayload;
  setAuto: { enabled: boolean };
  stopProcessing: { taskId: string | null };
  setLocale: { locale: string };
  openFile: { file: string; line: number };
}

// Host-provided capability the service can't implement itself: opening a file in the
// editor needs the VS Code host, so it's injected. A behavior contract → interface.
export interface FileOpener {
  open(absolutePath: string, line: number): Promise<void>;
}

export type BehaviorSummaryReport = {
  file: string;
  behavior: string;
  text: string;
}

// What one headless run reports back, written to its own per-task result file
// (.visualise/results/<id>.json); the host is the SOLE writer of the shared queue,
// merging this in at run exit. Discriminated by `kind` so every outcome carries
// exactly its own fields — no "set or leave untouched" nullable patch bag.
export type ProposedResult = {
  kind: "proposed";
  diff: string;
  impact: TaskImpact;
  messages: TaskMessage[];
};
export type AppliedResult = {
  kind: "applied";
  diff: string;
  impact: TaskImpact;
  commitMessage: string;
  messages: TaskMessage[];
};
export type DescribedResult = {
  kind: "described";
  summary: BehaviorSummaryReport;
  messages: TaskMessage[];
};
export type FailedResult = {
  kind: "error";
  messages: TaskMessage[];
};
// Claude needs the user to answer before it can propose — posts a question, leaves
// the task where it is (the user's reply re-triggers the run).
export type ClarifyResult = {
  kind: "clarify";
  messages: TaskMessage[];
};
export type RunResult = ProposedResult | AppliedResult | DescribedResult | FailedResult | ClarifyResult;

export type FileTemplate = string;

export type ScaffoldRequest = {
  fileName: string;
  template: FileTemplate;
  typeName: string;
  dir: string;
  absoluteDir: string;
  goPackage: string;
}

export type AutoStatus = {
  available: boolean;
  enabled: boolean;
  running: boolean;
  reason: "docker" | "claude-cli-missing" | null;
}

// Live "what Claude is doing right now" for the task currently being processed.
export type AutoActivity = {
  taskId: string;
  text: string;
  at: string;
}

// Cached one-line "what this method does" summary Claude writes on demand.
export type BehaviorSummary = {
  text: string;
  at: string;
}

// One sample point of the cost curve: an input size n = 10^nExponent and the resulting
// operation count ops = 10^opsExponent. Stored as exponents so the arithmetic stays
// exact (no float overflow) — opsExponent is always nExponent * loopDepth.
export type ComplexityScale = {
  nExponent: number;
  opsExponent: number;
}

// Static, deterministic complexity metrics for one method. `bigO` is derived from loop
// nesting (and so labeled as such in the UI — it is a defensible upper bound from the
// loop structure, not a proof of asymptotic complexity); `cyclomatic`, `loopDepth`,
// `recursive` and `loc` are exact counts. `scale` is empty for O(1)/recursive.
export type ComplexityReport = {
  bigO: string;
  cyclomatic: number;
  loopDepth: number;
  recursive: boolean;
  loc: number;
  scale: ComplexityScale[];
}

// Data-access risk surfaced from STATIC analysis only — never a runtime measurement. Each
// kind names a query/ORM anti-pattern we can defensibly detect from source text; the UI
// labels them as risk signals, not timings (real latency depends on data, indexes & plan).
export type QueryRiskKind =
  | "nPlusOne" // a query call inside a loop / .map / forEach / foreach
  | "selectStar" // SELECT * — fetches every column
  | "noWhere" // SELECT without WHERE (and no LIMIT) — full scan
  | "writeNoWhere" // UPDATE/DELETE without WHERE — touches every row
  | "leadingWildcard" // LIKE '%…' — cannot use an index
  | "manyJoins" // 3+ JOINs in one statement
  | "unboundedFind" // findAll()/findMany() with no filter
  | "eagerInclude"; // 3+ chained Include()/include eager loads

export type QuerySeverity = "moderate" | "high";

// One detected anti-pattern. `detail` is an optional already-localised fragment (e.g. the
// offending table or a count) the UI may append; `kind` selects the explanatory message.
export type QueryFinding = {
  kind: QueryRiskKind;
  severity: QuerySeverity;
  detail?: string;
}

// Aggregate data-access risk for one method. `risk` mirrors the complexity strip's bands
// so the UI can reuse the same colour vocabulary. Empty `findings` ⇒ nothing to show.
export type QueryReport = {
  risk: "low" | "moderate" | "risky" | "high";
  findings: QueryFinding[];
}

// A source-derived "storyboard" of how one method runs, read straight off the text (never
// executed — so it's the static call order, not a runtime trace). Discriminated by `kind`
// so each step carries exactly its own fields: the inputs it receives, each call it makes
// (what it calls, with what, whether awaited, what it captures), and what it returns. The
// UI animates these in order; a later layer can hang Claude narration off the same steps.
export type FlowInputStep = {
  kind: "input";
  params: string[];
};

// One call the body makes. `receiver` is the dotted object the call lands on
// (`this.driverPickupService`) or null for a bare/free call; `callee` is the method;
// `assignsTo` is the variable that captures the result (or null if discarded); `awaited`
// marks an `await`ed async hop.
export type FlowCallStep = {
  kind: "call";
  receiver: string | null;
  callee: string;
  args: string[];
  awaited: boolean;
  assignsTo: string | null;
};

export type FlowReturnStep = {
  kind: "return";
  expression: string;
};

// A `throw` the body makes (often a guard: `throw new BusinessException(...)`). Carried as
// its own step so the storyboard can show *where* a method bails out — typically inside a
// branch, which is exactly the logic the user wants to follow.
export type FlowThrowStep = {
  kind: "throw";
  expression: string;
};

// An `if (condition) { … } else { … }` in the body. `condition` is the raw source text of
// the test (e.g. `!route`, `stops.length > 2`); `whenTrue`/`whenFalse` are the nested
// storyboards for each path (`whenFalse` is empty when there's no `else`). The tree is
// recursive — branches nest branches — so the UI can render which calls happen in which
// case and a simulator can light up only the path a given payload takes.
export type FlowBranchStep = {
  kind: "branch";
  condition: string;
  whenTrue: FlowStep[];
  whenFalse: FlowStep[];
};

export type FlowStep =
  | FlowInputStep
  | FlowCallStep
  | FlowReturnStep
  | FlowThrowStep
  | FlowBranchStep;

// The ordered storyboard. Empty `steps` ⇒ nothing worth animating (e.g. a one-liner with
// no calls and no inputs); the UI then shows no flow section.
export type FlowReport = {
  steps: FlowStep[];
}

export type PreferredLanguage = "typescript" | "java" | "csharp" | "go";

export type NamingPreferences = {
  classCase: string;
  methodCase: string;
  variableCase: string;
  constantCase: string;
  fileNaming: string;
  booleanPrefixes: string[];
  testPattern: string;
  allowAbbreviations: boolean;
}

export type ArchitecturePreferences = {
  dependencyInjection: string;
  layering: string[];
  packaging: string;
  patterns: string[];
  errorHandling: string;
}

export type QualityGatePreferences = {
  maxTimeComplexity: string;
  forbidNPlusOneQueries: boolean;
  requireImpactAnalysis: boolean;
  forbidCodeDuplication: boolean;
  maxMethodLines: number;
  enforceSingleResponsibility: boolean;
}

// The per-repo coding standard the UI form fills and Claude obeys when it
// generates or moves code (persisted at .visualise/coding-preferences.json).
export type CodingPreferences = {
  primaryLanguage: PreferredLanguage;
  // Empty string = no framework preference. Constrained in the UI to the primary
  // language's known frameworks, but stored as a free string so it stays forward-compatible.
  preferredFramework: string;
  naming: NamingPreferences;
  architecture: ArchitecturePreferences;
  qualityGates: QualityGatePreferences;
  commentsPolicy: string;
}
