import { ClassNode, DependencySource, Edge } from "./types";

interface PairKind {
  source: string;
  target: string;
  kind: DependencySource;
}

export class EdgeBuilder {
  // Collapse to one edge per (source, target) pair. Constructor injection often
  // shows up as both a field and a constructor param; keep one edge and prefer
  // "constructor" since it is the stronger signal.
  build(nodes: readonly ClassNode[]): Edge[] {
    const idsByName = new Map<string, string[]>();
    for (const node of nodes) {
      const ids = idsByName.get(node.name);
      if (ids) {
        ids.push(node.id);
      } else {
        idsByName.set(node.name, [node.id]);
      }
    }

    const pairKinds = new Map<string, PairKind>();
    for (const node of nodes) {
      for (const dependency of node.dependencies) {
        if (dependency.baseType === null) {
          continue;
        }
        const targets = idsByName.get(dependency.baseType);
        if (!targets) {
          continue; // external type (String, List, MonoBehaviour, …)
        }
        for (const targetId of targets) {
          if (targetId === node.id) {
            continue;
          }
          const key = `${node.id}->${targetId}`;
          const existing = pairKinds.get(key);
          if (!existing) {
            pairKinds.set(key, { source: node.id, target: targetId, kind: dependency.source });
          } else if (dependency.source === "constructor") {
            existing.kind = "constructor";
          }
        }
      }
    }

    const edges: Edge[] = [];
    for (const pair of pairKinds.values()) {
      edges.push({ id: `e${edges.length}`, source: pair.source, target: pair.target, kind: pair.kind });
    }
    return edges;
  }
}
