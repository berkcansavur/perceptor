import type { ClassNode } from "./types";
import type { TestDiscovery } from "./TestDiscovery";

type MethodReadiness = {
  readonly behavior: string;
  readonly status: "tested" | "untested";
};

type ClassDebugReport = {
  readonly className: string;
  readonly file: string;
  readonly methods: readonly MethodReadiness[];
  readonly debuggablePercent: number;
  readonly testFile: string | null;
  readonly suggestedTestPath: string | null;
};

type DebugReadinessTested = {
  readonly status: "tested";
  readonly testFile: string;
  readonly framework: string;
};

type DebugReadinessUntested = {
  readonly status: "untested";
  readonly suggestedTestPath: string;
};

// Readiness is test-existence-driven: a method is "tested" when a test covers it,
// otherwise "untested". (There is no "pure" — that heuristic was removed.)
type DebugReadiness = DebugReadinessTested | DebugReadinessUntested;

export type { DebugReadiness, MethodReadiness, ClassDebugReport };

export class DebugReadinessAnalyzer {
  constructor(private readonly testDiscovery: TestDiscovery) {}

  analyze(node: ClassNode, rootDir: string, methodName?: string): DebugReadiness {
    // Decision is test-existence-driven AND per-method: "tested" only when a test
    // file exists that actually covers THIS method. A test that covers method A
    // must not make method B run A's test — B is "untested" and gets a runner in
    // its own scope. Constructor deps only influence whether the runner stubs.
    if (methodName) {
      const testResult = this.testDiscovery.findTestCovering(node.file, rootDir, methodName);
      if (testResult) {
        return { status: "tested", testFile: testResult.testFile, framework: testResult.framework };
      }
    }

    return { status: "untested", suggestedTestPath: this.testDiscovery.suggestTestPath(node.file, node.language) };
  }

  analyzeClass(node: ClassNode, rootDir: string): ClassDebugReport {
    const methodNames = node.behaviors.map((behavior) => behavior.name);

    const allTests = this.testDiscovery.findAllTestsForClass(node.file, rootDir);
    if (allTests.length > 0) {
      // Union coverage across every test file (beside-source, perceptor-tests, …).
      const covered = new Set<string>();
      for (const test of allTests) {
        for (const name of this.testDiscovery.findTestedMethods(test.testFile, rootDir, methodNames)) {
          covered.add(name);
        }
      }
      const methods = methodNames.map((name) => ({
        behavior: name,
        status: covered.has(name) ? "tested" as const : "untested" as const,
      }));
      const debuggableCount = methods.filter((method) => method.status === "tested").length;
      const debuggablePercent = methods.length > 0 ? Math.round((debuggableCount / methods.length) * 100) : 0;
      return {
        className: node.name,
        file: node.file,
        methods,
        debuggablePercent,
        testFile: allTests[0]!.testFile,
        suggestedTestPath: null,
      };
    }

    return {
      className: node.name,
      file: node.file,
      methods: methodNames.map((name) => ({ behavior: name, status: "untested" as const })),
      debuggablePercent: 0,
      testFile: null,
      suggestedTestPath: this.testDiscovery.suggestTestPath(node.file, node.language),
    };
  }
}
