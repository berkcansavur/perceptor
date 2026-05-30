import type { AppState } from "../state/AppState";
import type { FolderEdge } from "../types";
import { folderColor } from "./roleColors";

const MIN_RADIUS = 9;
const RADIUS_SCALE = 6;
const MAX_RADIUS = 64;

interface LayoutPoint {
  dir: string;
  r: number;
  x: number;
  y: number;
}

// Aggregates the class graph into a folder graph and runs the force-directed
// layout. Pure transforms over AppState (no DOM).
export class GraphModel {
  constructor(private readonly state: AppState) {}

  build(): void {
    const folders = new Map<string, { dir: string; label: string; count: number; members: string[] }>();
    for (const node of this.state.nodes) {
      let folder = folders.get(node.dir);
      if (!folder) {
        folder = { dir: node.dir, label: node.folder, count: 0, members: [] };
        folders.set(node.dir, folder);
      }
      folder.count += 1;
      folder.members.push(node.name.toLowerCase());
    }

    const dirOf = new Map(this.state.nodes.map((node) => [node.id, node.dir]));
    const edgeWeights = new Map<string, number>();
    for (const edge of this.state.edges) {
      const sourceDir = dirOf.get(edge.source);
      const targetDir = dirOf.get(edge.target);
      if (!sourceDir || !targetDir || sourceDir === targetDir) {
        continue;
      }
      const key = sourceDir < targetDir ? `${sourceDir} ${targetDir}` : `${targetDir} ${sourceDir}`;
      edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
    }

    const degree = new Map<string, number>();
    const adjacency = new Map<string, Set<string>>();
    const folderEdges: FolderEdge[] = [];
    for (const [key, weight] of edgeWeights) {
      const [a, b] = key.split(" ") as [string, string];
      folderEdges.push({ a, b, weight });
      degree.set(a, (degree.get(a) ?? 0) + weight);
      degree.set(b, (degree.get(b) ?? 0) + weight);
      if (!adjacency.has(a)) {
        adjacency.set(a, new Set());
      }
      if (!adjacency.has(b)) {
        adjacency.set(b, new Set());
      }
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    }

    this.state.folderEdges = folderEdges;
    this.state.adjacency = adjacency;
    this.state.folderNodes = [...folders.values()].map((folder) => {
      const folderDegree = degree.get(folder.dir) ?? 0;
      return {
        ...folder,
        degree: folderDegree,
        radius: Math.min(MAX_RADIUS, MIN_RADIUS + RADIUS_SCALE * Math.sqrt(folderDegree)),
        color: folderColor(folder.label),
      };
    });
    this.state.folderByDir = new Map(this.state.folderNodes.map((folder) => [folder.dir, folder]));
  }

  layout(): void {
    const nodes = this.state.folderNodes;
    const count = nodes.length;
    if (count === 0) {
      return;
    }

    const radius = Math.max(300, count * 30);
    const layout: LayoutPoint[] = nodes.map((node, index) => {
      const angle = (index / count) * Math.PI * 2;
      return {
        dir: node.dir,
        r: node.radius,
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * 30,
        y: Math.sin(angle) * radius + (Math.random() - 0.5) * 30,
      };
    });
    const indexByDir = new Map(layout.map((point, index) => [point.dir, index]));
    const edges = this.state.folderEdges
      .map((edge) => ({ a: indexByDir.get(edge.a), b: indexByDir.get(edge.b), weight: edge.weight }))
      .filter((edge): edge is { a: number; b: number; weight: number } => edge.a !== undefined && edge.b !== undefined);

    const REPULSION = 24000;
    const SPRING_K = 0.015;
    const REST_LENGTH = 150;
    const GRAVITY = 0.02;
    const iterations = 420;

    for (let step = 0; step < iterations; step++) {
      const forceX = new Float64Array(count);
      const forceY = new Float64Array(count);

      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = layout[i].x - layout[j].x;
          const dy = layout[i].y - layout[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minDistance = layout[i].r + layout[j].r + 24;
          let force = REPULSION / (distance * distance);
          if (distance < minDistance) {
            force += (minDistance - distance) * 0.6;
          }
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          forceX[i] += fx;
          forceY[i] += fy;
          forceX[j] -= fx;
          forceY[j] -= fy;
        }
      }

      for (const edge of edges) {
        const dx = layout[edge.b].x - layout[edge.a].x;
        const dy = layout[edge.b].y - layout[edge.a].y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (distance - REST_LENGTH) * SPRING_K * Math.min(3, edge.weight);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        forceX[edge.a] += fx;
        forceY[edge.a] += fy;
        forceX[edge.b] -= fx;
        forceY[edge.b] -= fy;
      }

      const damping = 0.85;
      for (let i = 0; i < count; i++) {
        forceX[i] -= layout[i].x * GRAVITY;
        forceY[i] -= layout[i].y * GRAVITY;
        layout[i].x += Math.max(-40, Math.min(40, forceX[i])) * damping;
        layout[i].y += Math.max(-40, Math.min(40, forceY[i])) * damping;
      }
    }

    let minX = Infinity;
    let minY = Infinity;
    for (const point of layout) {
      minX = Math.min(minX, point.x - point.r);
      minY = Math.min(minY, point.y - point.r);
    }
    this.state.position = new Map(
      layout.map((point) => [point.dir, { x: point.x - minX + 100, y: point.y - minY + 100 }])
    );
  }

  extent(): { width: number; height: number } {
    let maxX = 0;
    let maxY = 0;
    for (const folder of this.state.folderNodes) {
      const position = this.state.position.get(folder.dir);
      if (!position) {
        continue;
      }
      maxX = Math.max(maxX, position.x + folder.radius + 100);
      maxY = Math.max(maxY, position.y + folder.radius + 100);
    }
    return { width: maxX, height: maxY };
  }
}
