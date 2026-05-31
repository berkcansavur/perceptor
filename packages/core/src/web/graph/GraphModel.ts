import type { AppState } from "../state/AppState";
import type { ClassNode, FolderEdge, FolderNode, Point } from "../types";
import { folderColor } from "./roleColors";

const MIN_RADIUS = 14;
const RADIUS_SCALE = 7;
const MAX_RADIUS = 60;

// Continuous force simulation (Obsidian-style) over the FOLDER HIERARCHY: every
// directory is a node, linked to its parent. Cooled by `alpha`, reheated on drag.
const CENTER = 1400;
const ALPHA_DECAY = 0.972;
const ALPHA_MIN = 0.008;
const ALPHA_REHEAT = 0.7;
const VELOCITY_DECAY = 0.6;
const REPULSION = 2600;
const MAX_REPULSION = 220;
const LINK_DISTANCE = 170;
const LINK_STRENGTH = 0.08;
const GRAVITY = 0.016;
const COLLIDE_PAD = 28;

type Velocity = {
  vx: number;
  vy: number;
}

// Aggregates the repo's directory tree into a folder-hierarchy graph and runs the
// live force layout one tick at a time. Pure transforms over AppState (no DOM).
export class GraphModel {
  private readonly velocities = new Map<string, Velocity>();
  private readonly fixed = new Map<string, Point>();
  private alpha = 0;

  constructor(private readonly state: AppState) {}

  build(): void {
    const classesByDir = new Map<string, ClassNode[]>();
    for (const node of this.state.nodes) {
      (classesByDir.get(node.dir) ?? this.put(classesByDir, node.dir)).push(node);
    }

    const dirs = new Set<string>();
    const addWithAncestors = (dir: string): void => {
      const parts = dir.split("/").filter(Boolean);
      for (let depth = 1; depth <= parts.length; depth++) {
        dirs.add(parts.slice(0, depth).join("/"));
      }
    };
    for (const dir of classesByDir.keys()) {
      addWithAncestors(dir);
    }
    for (const dir of this.state.directories) {
      addWithAncestors(dir);
    }

    const folderEdges: FolderEdge[] = [];
    const adjacency = new Map<string, Set<string>>();
    const childCount = new Map<string, number>();
    for (const dir of dirs) {
      adjacency.set(dir, new Set());
    }
    for (const dir of dirs) {
      const parent = this.parentOf(dir);
      if (parent && dirs.has(parent)) {
        folderEdges.push({ a: parent, b: dir, weight: 1 });
        adjacency.get(parent)!.add(dir);
        adjacency.get(dir)!.add(parent);
        childCount.set(parent, (childCount.get(parent) ?? 0) + 1);
      }
    }

    this.state.folderEdges = folderEdges;
    this.state.adjacency = adjacency;
    this.state.folderNodes = [...dirs].map((dir) => {
      const classes = classesByDir.get(dir) ?? [];
      const label = dir === "." ? "/" : dir.split("/").pop() ?? dir;
      const weight = classes.length + (childCount.get(dir) ?? 0);
      return {
        dir,
        label,
        count: classes.length,
        members: classes.map((node) => node.name.toLowerCase()),
        degree: childCount.get(dir) ?? 0,
        radius: Math.min(MAX_RADIUS, MIN_RADIUS + RADIUS_SCALE * Math.sqrt(weight)),
        color: folderColor(label),
      };
    });
    this.state.folderByDir = new Map(this.state.folderNodes.map((folder) => [folder.dir, folder]));
    this.seed();
  }

  // Direct-child classes of a folder — the list card shown when its node is clicked.
  classesIn(dir: string): ClassNode[] {
    return this.state.nodes.filter((node) => node.dir === dir);
  }

  private put(map: Map<string, ClassNode[]>, dir: string): ClassNode[] {
    const list: ClassNode[] = [];
    map.set(dir, list);
    return list;
  }

  private parentOf(dir: string): string | null {
    const segments = dir.split("/").filter(Boolean);
    return segments.length <= 1 ? null : segments.slice(0, -1).join("/");
  }

  private seed(): void {
    const nodes = this.state.folderNodes;
    const spread = Math.max(240, nodes.length * 22);
    nodes.forEach((node, index) => {
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
      this.state.position.set(node.dir, {
        x: CENTER + Math.cos(angle) * spread,
        y: CENTER + Math.sin(angle) * spread,
      });
      this.velocities.set(node.dir, { vx: 0, vy: 0 });
    });
    this.fixed.clear();
    this.alpha = 1;
  }

  reseed(): void {
    this.seed();
  }

  reheat(): void {
    this.alpha = Math.max(this.alpha, ALPHA_REHEAT);
  }

  isActive(): boolean {
    return this.alpha > ALPHA_MIN;
  }

  pin(dir: string, point: Point): void {
    this.fixed.set(dir, point);
    this.state.position.set(dir, point);
  }

  unpin(dir: string): void {
    this.fixed.delete(dir);
  }

  tick(): boolean {
    if (this.alpha <= ALPHA_MIN) {
      return false;
    }
    const nodes = this.state.folderNodes;
    const position = this.state.position;
    this.applyRepulsion(nodes, position);
    this.applyLinks(position);
    this.applyGravity(nodes, position);
    this.integrate(nodes, position);
    this.alpha *= ALPHA_DECAY;
    return this.alpha > ALPHA_MIN;
  }

  // All-pairs n-body repulsion. This is inherently O(pairs) — every node pushes every
  // other — so it's quadratic by algorithm, not by accident; a quadtree (Barnes-Hut)
  // is the only way to make it sub-quadratic. It runs over FOLDER nodes (few), once
  // per cooled tick, so it stays cheap. Expressed as a single pass over unique pairs.
  private applyRepulsion(nodes: readonly FolderNode[], position: Map<string, Point>): void {
    this.uniquePairs(nodes).forEach(([a, b]) => this.repel(a, b, position));
  }

  // Each unordered pair once (i < j).
  private uniquePairs(nodes: readonly FolderNode[]): [FolderNode, FolderNode][] {
    return nodes.flatMap((a, index) => nodes.slice(index + 1).map((b) => [a, b] as [FolderNode, FolderNode]));
  }

  private repel(a: FolderNode, b: FolderNode, position: Map<string, Point>): void {
    const pa = position.get(a.dir)!;
    const pb = position.get(b.dir)!;
    const dx = pa.x - pb.x;
    const dy = pa.y - pb.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
    let force = Math.min(MAX_REPULSION, REPULSION / distance);
    const minDistance = a.radius + b.radius + COLLIDE_PAD;
    if (distance < minDistance) {
      force += (minDistance - distance) * 0.5;
    }
    const ux = (dx / distance) * force * this.alpha;
    const uy = (dy / distance) * force * this.alpha;
    const va = this.velocities.get(a.dir)!;
    const vb = this.velocities.get(b.dir)!;
    va.vx += ux;
    va.vy += uy;
    vb.vx -= ux;
    vb.vy -= uy;
  }

  private applyLinks(position: Map<string, Point>): void {
    for (const edge of this.state.folderEdges) {
      const pointA = position.get(edge.a);
      const pointB = position.get(edge.b);
      const velocityA = this.velocities.get(edge.a);
      const velocityB = this.velocities.get(edge.b);
      if (!pointA || !pointB || !velocityA || !velocityB) {
        continue;
      }
      const deltaX = pointB.x - pointA.x;
      const deltaY = pointB.y - pointA.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 0.01;
      const force = (distance - LINK_DISTANCE) * LINK_STRENGTH * this.alpha;
      const forceX = (deltaX / distance) * force;
      const forceY = (deltaY / distance) * force;
      velocityA.vx += forceX;
      velocityA.vy += forceY;
      velocityB.vx -= forceX;
      velocityB.vy -= forceY;
    }
  }

  private applyGravity(nodes: AppState["folderNodes"], position: Map<string, Point>): void {
    for (const node of nodes) {
      const point = position.get(node.dir)!;
      const velocity = this.velocities.get(node.dir)!;
      velocity.vx += (CENTER - point.x) * GRAVITY * this.alpha;
      velocity.vy += (CENTER - point.y) * GRAVITY * this.alpha;
    }
  }

  private integrate(nodes: AppState["folderNodes"], position: Map<string, Point>): void {
    for (const node of nodes) {
      const pinned = this.fixed.get(node.dir);
      const velocity = this.velocities.get(node.dir)!;
      if (pinned) {
        velocity.vx = 0;
        velocity.vy = 0;
        position.set(node.dir, { x: pinned.x, y: pinned.y });
        continue;
      }
      velocity.vx *= VELOCITY_DECAY;
      velocity.vy *= VELOCITY_DECAY;
      const point = position.get(node.dir)!;
      position.set(node.dir, { x: point.x + velocity.vx, y: point.y + velocity.vy });
    }
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of this.state.folderNodes) {
      const point = this.state.position.get(node.dir);
      if (point) {
        minX = Math.min(minX, point.x - node.radius);
        minY = Math.min(minY, point.y - node.radius);
        maxX = Math.max(maxX, point.x + node.radius);
        maxY = Math.max(maxY, point.y + node.radius);
      }
    }
    if (!Number.isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    return { minX, minY, maxX, maxY };
  }
}
