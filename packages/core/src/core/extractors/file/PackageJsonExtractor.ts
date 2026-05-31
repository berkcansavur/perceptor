import { Behavior, FileNodeExtractor, ParsedClass } from "../../types";

const PACKAGE_JSON = "package.json";

type PackageManifest = {
  scripts?: Record<string, string>;
}

// Surfaces a package.json as a "config" node whose behaviors are its npm scripts —
// the repo's entry points (build/test/start) visible at a glance in the map.
export class PackageJsonExtractor implements FileNodeExtractor {
  matches(fileName: string): boolean {
    return fileName === PACKAGE_JSON;
  }

  extract(fileName: string, content: string, relativeFile: string): readonly ParsedClass[] {
    return [
      {
        name: fileName,
        kind: "config",
        file: relativeFile,
        line: 1,
        dependencies: [],
        behaviors: this.readScripts(content),
      },
    ];
  }

  private readScripts(content: string): Behavior[] {
    const scripts = this.parse(content).scripts ?? {};
    return Object.keys(scripts).map((name) => this.toBehavior(name, scripts[name] ?? ""));
  }

  private parse(content: string): PackageManifest {
    try {
      return JSON.parse(content) as PackageManifest;
    } catch {
      return {};
    }
  }

  private toBehavior(name: string, command: string): Behavior {
    return { name, visibility: "public", isStatic: false, returnType: command, params: [], line: 1, endLine: 1 };
  }
}
