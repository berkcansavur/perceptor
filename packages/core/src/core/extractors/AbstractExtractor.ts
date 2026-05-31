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
      const syntaxNode = stack.pop();
      if (!syntaxNode) {
        continue;
      }
      const kind = this.classKind(syntaxNode.type);
      if (kind) {
        const parsedClass = this.readClass(syntaxNode, kind, relativeFile);
        if (parsedClass) {
          classes.push(parsedClass);
        }
      }
      for (const child of syntaxNode.namedChildren) {
        stack.push(child);
      }
    }
    return classes;
  }
}
