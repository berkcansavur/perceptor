import type { ClassNode } from "../core/types";

export type { Behavior, ClassNode, Edge, Graph } from "../core/types";
export type {
  ArchitecturePreferences,
  AutoActivity,
  AutoStatus,
  BehaviorSummary,
  CodingPreferences,
  ComplexityReport,
  ComplexityScale,
  FlowReport,
  FlowStep,
  FlowInputStep,
  FlowCallStep,
  FlowReturnStep,
  FlowThrowStep,
  FlowBranchStep,
  QueryReport,
  QueryFinding,
  QueryRiskKind,
  NamingPreferences,
  PreferredLanguage,
  QualityGatePreferences,
  // Discriminated task model — the single source of truth lives in the service layer.
  Task,
  TaskKind,
  TaskStatus,
  TaskMessage,
  MessageAttachment,
  TaskImpact,
  TaskUsage,
  TaskLock,
  TaskEndpoint,
  BehaviorEndpoint,
  ClassFileEndpoint,
  DirectoryEndpoint,
  AddBehaviorSpec,
  EditBehaviorSpec,
  CreateFileSpec,
  CreateFolderSpec,
  RequestSpec,
  DescribeBehaviorSpec,
  ErrorHandling,
  ApiRequest,
  CreatePayload,
  EmptyRequest,
  EnqueuePayload,
  UpdatePayload,
} from "../service/types";
export type { ApiResponse, ApiError } from "../service/api";

import type { BehaviorEndpoint, ClassFileEndpoint } from "../service/types";

export type ViewMode = "graph" | "folder" | "chat" | "changes";

export type FolderColor = {
  accent: string;
  stroke: string;
  fill: string;
}

export type FolderNode = {
  dir: string;
  label: string;
  count: number;
  members: string[];
  degree: number;
  radius: number;
  color: FolderColor;
}

export type FolderEdge = {
  a: string;
  b: string;
  weight: number;
}

export type Point = {
  x: number;
  y: number;
}

export type TreeFolder = {
  name: string;
  path: string;
  folders: Map<string, TreeFolder>;
  classes: ClassNode[];
}

export type MetaResponse = {
  root: string;
  hostRoot: string | null;
  version: number | null;
  locale: string | null;
}

export type BrowseEntry = {
  name: string;
  path: string;
}

export type BrowseData = {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export type TemplateRegistry = {
  extensionFamily: Record<string, string>;
  familyTemplates: Record<string, string[]>;
}

// Cross-component events (decoupled pub/sub through the Emitter).
export type AppEvents = {
  "graph:reload": void;
  "graph:relayout": void;
  "graph:reanalyze": void;
  "mode:set": ViewMode;
  "folder:open": string;
  "form:behavior": { className: string; file: string };
  "form:edit": { className: string; file: string; behavior: string; line: string; endLine: string };
  "behavior:open": {
    className: string;
    file: string;
    behavior: string;
    line: string;
    endLine: string;
    signature: string;
  };
  "form:create": { kind: string; dir: string };
  "task:move": { from: BehaviorEndpoint; to: ClassFileEndpoint };
  "file:open": { file: string; line: string };
  "tasks:open": void;
  "tasks:refresh": void;
  "auto:changed": void;
  "changes:focus": string | null;
  "chat:select": string;
  "chat:new": { description: string };
  "search:changed": void;
  "lang:changed": void;
  "toast": string;
}
