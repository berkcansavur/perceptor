import type { ClassNode } from "../core/types";

export type { Behavior, ClassNode, Edge, Graph } from "../core/types";

export type ViewMode = "graph" | "folder";

export interface FolderColor {
  accent: string;
  stroke: string;
  fill: string;
}

export interface FolderNode {
  dir: string;
  label: string;
  count: number;
  members: string[];
  degree: number;
  radius: number;
  color: FolderColor;
}

export interface FolderEdge {
  a: string;
  b: string;
  weight: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface TreeFolder {
  name: string;
  path: string;
  folders: Map<string, TreeFolder>;
  classes: ClassNode[];
}

export interface TaskMessage {
  role: string;
  text: string;
}

export interface TaskSpec {
  name?: string;
  description?: string;
  errorHandling?: { mode: string; exception: string };
}

export interface TaskEndpoint {
  class: string;
  file: string;
  behavior: string;
  dir: string;
}

export interface TaskImpact {
  risk?: string;
  notes?: string[];
}

export interface Task {
  id: string;
  type: string;
  status: string;
  from: TaskEndpoint;
  to: TaskEndpoint;
  spec: TaskSpec | null;
  diff?: string | null;
  impact?: TaskImpact;
  commitMessage?: string;
  dismissed?: boolean;
  lock?: unknown;
  messages?: TaskMessage[];
}

export interface MoveTaskFrom {
  class: string;
  file: string;
  behavior: string;
}

export interface MoveTaskTo {
  class: string;
  file: string;
}

export interface AutoStatus {
  available?: boolean;
  enabled?: boolean;
  running?: boolean;
  reason?: string;
}

export interface MetaResponse {
  root: string;
  hostRoot?: string;
  version?: number;
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseData {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export interface TemplateRegistry {
  extensionFamily: Record<string, string>;
  familyTemplates: Record<string, string[]>;
}

// Cross-component events (decoupled pub/sub through the Emitter).
export interface AppEvents {
  "graph:reload": void;
  "graph:relayout": void;
  "mode:set": ViewMode;
  "folder:open": string;
  "form:behavior": { className: string; file: string };
  "form:edit": { className: string; file: string; behavior: string; line: string; endLine: string };
  "form:create": { kind: string; dir: string };
  "task:move": { from: MoveTaskFrom; to: MoveTaskTo };
  "file:open": { file: string; line: string };
  "tasks:open": void;
  "tasks:refresh": void;
  "search:changed": void;
  "lang:changed": void;
  "toast": string;
}
