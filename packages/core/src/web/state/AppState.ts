import type { ClassNode, Edge, FolderNode, FolderEdge, Point, ViewMode } from "../types";

// Single source of truth for the loaded graph + current view state.
export class AppState {
  nodes: readonly ClassNode[] = [];
  edges: readonly Edge[] = [];
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
}
