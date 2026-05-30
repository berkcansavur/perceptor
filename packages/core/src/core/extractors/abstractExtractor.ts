import { ClassKind, LanguageExtractor, ParsedClass, TsNode } from "../types";

// Template Method: the AST walk is shared; each language only decides which
// node types are classes and how to read one. New languages subclass this
// (Open/Closed) without touching existing extractors.
export abstract class AbstractExtractor implements LanguageExtractor {
  protected abstract classKind(nodeType: string): ClassKind | null;

  protected abstract readClass(node: TsNode, kind: ClassKind, relativeFile: string): ParsedClass | null;

  extract(rootNode: TsNode, relativeFile: string): readonly ParsedClass[] {
    const classes: ParsedClass[] = [];
    const stack: TsNode[] = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }
      const kind = this.classKind(node.type);
      if (kind) {
        const parsed = this.readClass(node, kind, relativeFile);
        if (parsed) {
          classes.push(parsed);
        }
      }
      for (const child of node.namedChildren) {
        stack.push(child);
      }
    }
    return classes;
  }
}
