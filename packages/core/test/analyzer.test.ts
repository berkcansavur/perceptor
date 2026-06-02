import * as path from "path";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/core/index";
import { resolveInstalledAssets } from "../src/core/installedAssets";
import type { Graph } from "../src/core/types";

const FIXTURES_DIRECTORY = path.resolve(__dirname, "fixtures");

interface Summary {
  readonly graph: Graph;
  readonly kinds: readonly string[];
  readonly edges: readonly string[];
}

async function summarize(language: string): Promise<Summary> {
  const graph = await analyze(path.join(FIXTURES_DIRECTORY, language), resolveInstalledAssets());
  const nameById = new Map(graph.nodes.map((node) => [node.id, node.name]));
  const kinds = graph.nodes.map((node) => `${node.kind}:${node.name}`).sort();
  const edges = graph.edges.map((edge) => `${nameById.get(edge.source)}->${nameById.get(edge.target)}`).sort();
  return { graph, kinds, edges };
}

describe("analyze — TypeScript", () => {
  it("extracts every kind including type aliases and exported consts", async () => {
    const { kinds } = await summarize("ts");
    expect(kinds).toEqual([
      "class:Order",
      "class:OrderRepository",
      "class:OrderService",
      "const:OrderSchema",
      "enum:OrderType",
      "function:computePriority",
      "type:OrderRequest",
    ]);
  });

  it("reads a function-valued exported const as a function node carrying its behavior", async () => {
    const { graph } = await summarize("ts");
    const fn = graph.nodes.find((node) => node.kind === "function" && node.name === "computePriority");
    expect(fn?.behaviors.map((behavior) => behavior.name)).toEqual(["computePriority"]);
    expect(fn?.behaviors[0]?.params.map((param) => param.name)).toEqual(["count"]);
    expect(fn?.behaviors[0]?.returnType).toBe("number");
  });

  it("builds dependency edges from fields, constructors and type references", async () => {
    const { edges } = await summarize("ts");
    expect(edges).toContain("OrderService->OrderRepository");
    expect(edges).toContain("Order->OrderType");
    expect(edges).toContain("OrderRepository->Order");
    expect(edges).toContain("OrderRequest->OrderType");
  });

  it("does not leak function-local consts as nodes", async () => {
    const { graph } = await summarize("ts");
    const consts = graph.nodes.filter((node) => node.kind === "const");
    expect(consts.map((node) => node.name)).toEqual(["OrderSchema"]);
  });
});

describe("analyze — every file becomes a node", () => {
  it("emits a module node for a class-less code file, carrying its top-level functions", async () => {
    const { graph } = await summarize("files");
    const moduleNode = graph.nodes.find((node) => node.kind === "module");
    expect(moduleNode?.name).toBe("main");
    expect(moduleNode?.behaviors.map((behavior) => behavior.name)).toEqual(["main"]);
  });

  it("surfaces package.json scripts as a config node's behaviors", async () => {
    const { graph } = await summarize("files");
    const packageNode = graph.nodes.find((node) => node.name === "package.json");
    expect(packageNode?.kind).toBe("config");
    expect(packageNode?.behaviors.map((behavior) => behavior.name)).toEqual(["build", "test"]);
  });

  it("surfaces Dockerfile build stages as a config node's behaviors", async () => {
    const { graph } = await summarize("files");
    const dockerNode = graph.nodes.find((node) => node.name === "Dockerfile");
    expect(dockerNode?.kind).toBe("config");
    expect(dockerNode?.behaviors.map((behavior) => behavior.name)).toEqual(["base"]);
  });

  it("represents any other file as a plain file node", async () => {
    const { graph } = await summarize("files");
    const readme = graph.nodes.find((node) => node.name === "README.md");
    expect(readme?.kind).toBe("file");
    expect(readme?.behaviors).toEqual([]);
  });
});

describe("analyze — Java", () => {
  it("extracts classes, interfaces, enums, records and annotation types", async () => {
    const { kinds } = await summarize("java");
    expect(kinds).toEqual([
      "annotation:Loggable",
      "class:Service",
      "enum:Color",
      "interface:Repository",
      "record:Point",
    ]);
  });

  it("wires constructor/field dependencies", async () => {
    const { edges } = await summarize("java");
    expect(edges).toContain("Service->Repository");
  });
});

describe("analyze — C#", () => {
  it("extracts classes, interfaces, enums, structs, records and delegates", async () => {
    const { kinds } = await summarize("csharp");
    expect(kinds).toEqual([
      "class:Order",
      "delegate:OrderPlaced",
      "enum:Color",
      "interface:IRepository",
      "record:CustomerRecord",
      "struct:Point",
    ]);
  });

  it("treats delegate parameters as dependencies", async () => {
    const { edges } = await summarize("csharp");
    expect(edges).toContain("Order->Color");
    expect(edges).toContain("OrderPlaced->Order");
  });
});
