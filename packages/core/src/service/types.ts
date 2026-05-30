// Server-side domain types (tasks, scaffolding, auto-processor).

export type TaskType =
  | "move-behavior"
  | "add-behavior"
  | "edit-behavior"
  | "create-file"
  | "create-folder";

export type TaskStatus =
  | "pending"
  | "proposed"
  | "approved"
  | "applied"
  | "rejected"
  | "error"
  | "processing";

export interface TaskEndpoint {
  class?: string;
  file?: string;
  behavior?: string;
  dir?: string;
}

export interface ErrorHandling {
  mode: string;
  exception: string;
}

export interface TaskSpec {
  name?: string;
  description?: string;
  signature?: string;
  line?: number;
  endLine?: number;
  errorHandling?: ErrorHandling;
}

export interface TaskMessage {
  role: string;
  text: string;
  at: string;
}

export interface TaskImpact {
  risk: string;
  notes: string[];
}

export interface TaskLock {
  pid: number | null;
  startedAt: string;
}

export interface AutoAttempt {
  status: string;
  attempts: number;
}

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  from: TaskEndpoint | null;
  to: TaskEndpoint | null;
  spec: TaskSpec | null;
  diff: string | null;
  impact?: TaskImpact;
  commitMessage?: string;
  dismissed?: boolean;
  lock?: TaskLock;
  auto?: AutoAttempt;
  messages: TaskMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface EnqueuePayload {
  type?: TaskType;
  from?: TaskEndpoint | null;
  to?: TaskEndpoint | null;
  spec?: TaskSpec | null;
}

export interface UpdatePayload {
  id: string;
  status?: TaskStatus;
  message?: string;
  diff?: string;
  role?: string;
  commitMessage?: string;
  impact?: TaskImpact;
  dismissed?: boolean;
}

export type FileTemplate = string;

export interface ScaffoldRequest {
  fileName: string;
  template: FileTemplate;
  typeName: string;
  dir: string;
  absoluteDir: string;
}

export interface AutoStatus {
  available: boolean;
  enabled: boolean;
  running: boolean;
  reason: "docker" | "claude-cli-missing" | null;
}
