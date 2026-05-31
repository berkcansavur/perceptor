import { Behavior, FileNodeExtractor, ParsedClass } from "../../types";

const DOCKERFILE = "Dockerfile";
const DOCKERFILE_SUFFIX = ".dockerfile";
const FROM_PATTERN = /^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i;

// Surfaces a Dockerfile as a "config" node whose behaviors are its build stages
// (each `FROM <image> [AS <stage>]`) — the image's build pipeline at a glance.
export class DockerfileExtractor implements FileNodeExtractor {
  matches(fileName: string): boolean {
    return fileName === DOCKERFILE || fileName.toLowerCase().endsWith(DOCKERFILE_SUFFIX);
  }

  extract(fileName: string, content: string, relativeFile: string): readonly ParsedClass[] {
    return [
      {
        name: fileName,
        kind: "config",
        file: relativeFile,
        line: 1,
        dependencies: [],
        behaviors: this.readStages(content),
      },
    ];
  }

  private readStages(content: string): Behavior[] {
    const stages: Behavior[] = [];
    const lines = content.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const match = FROM_PATTERN.exec(lines[lineIndex] ?? "");
      if (match) {
        const baseImage = match[1] ?? "";
        stages.push(this.toBehavior(match[2] ?? baseImage, baseImage, lineIndex + 1));
      }
    }
    return stages;
  }

  private toBehavior(stage: string, baseImage: string, line: number): Behavior {
    return { name: stage, visibility: "public", isStatic: false, returnType: baseImage, params: [], line, endLine: line };
  }
}
