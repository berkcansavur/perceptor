import { ClassNode, DependencySource, Edge } from "./types";

type PairKind = {
  source: string;
  target: string;
  kind: DependencySource;
}

// Linear edge builder: O(N + D + E) — N nodes, D dependencies, E edges. Every
// lookup is an O(1) hash-map hit; nothing scans the node list more than once.
export class EdgeBuilder {
  build(nodes: readonly ClassNode[]): Edge[] {
    const idsByName = this.indexIdsByName(nodes);
    const pairs = this.collectPairs(nodes, idsByName);
    return this.toEdges(pairs);
  }

  // name -> ids. A simple name can resolve to several nodes (same class name in
  // different folders), so each name maps to a list. O(N).
  private indexIdsByName(nodes: readonly ClassNode[]): Map<string, string[]> {
    const idsByName = new Map<string, string[]>();
    for (const node of nodes) {
      const ids = idsByName.get(node.name);
      if (ids) {
        ids.push(node.id);
      } else {
        idsByName.set(node.name, [node.id]);
      }
    }
    return idsByName;
  }

  // No nested loops: flatten node → its dependencies → resolved targets into one flat
  // stream of candidate edges (each step a map/flatMap with O(1) Map lookups), then fold
  // that stream into the dedup Map via get/set in recordPair.
  private collectPairs(nodes: readonly ClassNode[], idsByName: Map<string, string[]>): Map<string, PairKind> {
    const pairKinds = new Map<string, PairKind>();
    this.candidateEdges(nodes, idsByName).forEach((edge) =>
      this.recordPair(edge.source, edge.target, edge.kind, pairKinds)
    );
    return pairKinds;
  }

  // One candidate per (source, resolved target). `flatMap` drops dependencies that
  // resolve to nothing (external types) and fans a shared name out to each owner.
  private candidateEdges(nodes: readonly ClassNode[], idsByName: Map<string, string[]>): PairKind[] {
    return nodes.flatMap((node) =>
      node.dependencies.flatMap((dependency) =>
        this.resolveTargets(dependency.baseType, idsByName).map((targetId) => ({
          source: node.id,
          target: targetId,
          kind: dependency.source,
        }))
      )
    );
  }

  // baseType → owner ids via an O(1) Map get. Empty for an external type (String,
  // List, MonoBehaviour, …) or a null base, so it contributes no candidate edge.
  private resolveTargets(baseType: string | null, idsByName: Map<string, string[]>): string[] {
    if (baseType === null) {
      return [];
    }
    return idsByName.get(baseType) ?? [];
  }

  // Collapse to one edge per (source, target). Constructor injection often shows
  // up as both a field and a constructor param; keep one edge and prefer
  // "constructor" since it is the stronger signal.
  private recordPair(
    sourceId: string,
    targetId: string,
    source: DependencySource,
    pairKinds: Map<string, PairKind>
  ): void {
    if (targetId === sourceId) {
      return;
    }
    const key = `${sourceId}->${targetId}`;
    const existing = pairKinds.get(key);
    if (!existing) {
      pairKinds.set(key, { source: sourceId, target: targetId, kind: source });
    } else if (source === "constructor") {
      existing.kind = "constructor";
    }
  }

  private toEdges(pairKinds: Map<string, PairKind>): Edge[] {
    const edges: Edge[] = [];
    for (const pair of pairKinds.values()) {
      edges.push({ id: `e${edges.length}`, source: pair.source, target: pair.target, kind: pair.kind });
    }
    return edges;
  }
}
