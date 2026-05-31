// Server-side domain types (tasks, scaffolding, auto-processor).

export type TaskType =
  | "move-behavior"
  | "add-behavior"
  | "edit-behavior"
  | "create-file"
  | "create-folder"
  | "request"
  | "describe-behavior";

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

// Lifecycle fields. diff/impact/commitMessage are null until a run produces them —
// and describe-behavior reaches "applied" with none of them — so null here is a
// real "not produced" state, not a missing-key bag.
export type TaskLifecycle = {
  status: TaskStatus;
  diff: string | null;
  impact: TaskImpact | null;
  commitMessage: string | null;
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

export type UpdatePayload = {
  id: string;
  status: TaskStatus | null;
  message: string | null;
  diff: string | null;
  role: string | null;
  commitMessage: string | null;
  impact: TaskImpact | null;
  dismissed: boolean | null;
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

export type PreferredLanguage = "typescript" | "java" | "csharp";

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
  additionalLanguages: PreferredLanguage[];
  naming: NamingPreferences;
  architecture: ArchitecturePreferences;
  qualityGates: QualityGatePreferences;
  commentsPolicy: string;
}
