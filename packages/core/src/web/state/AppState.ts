import type { ClassNode, ClassDebugReport, Edge, FolderNode, FolderEdge, Point, ViewMode } from "../types";

// Single source of truth for the loaded graph + current view state.
export class AppState {
  nodes: readonly ClassNode[] = [];
  edges: readonly Edge[] = [];
  debugReadiness = new Map<string, ClassDebugReport>();
  directories: readonly string[] = [];
  nodeById = new Map<string, ClassNode>();

  folderNodes: FolderNode[] = [];
  folderEdges: FolderEdge[] = [];
  folderByDir = new Map<string, FolderNode>();
  adjacency = new Map<string, Set<string>>();
  position = new Map<string, Point>();

  mode: ViewMode = "graph";
  view = { x: 0, y: 0, scale: 1 };
  userAdjusted = false;
  hostRoot: string | null = null;
  searchQuery = "";
  // Graph scope: when set, only folders under this path are rendered.
  // Empty string means root (show everything).
  scopePath = "";
  // Node kinds the folder view currently hides (toggled off via the kind-filter chips).
  // Empty means everything is shown.
  hiddenKinds = new Set<string>();
}
