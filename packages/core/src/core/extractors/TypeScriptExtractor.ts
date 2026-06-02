import { AbstractExtractor } from "./AbstractExtractor";
import { baseTypeName, fieldText, firstChildOfType, visibilityFrom } from "../syntaxTree";
import { Behavior, ClassKind, Dependency, Parameter, ParsedClass, TsNode } from "../types";

const KIND_BY_NODE_TYPE: Readonly<Record<string, ClassKind>> = {
  class_declaration: "class",
  abstract_class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
  type_alias_declaration: "type",
  lexical_declaration: "const",
};

const EXPORT_STATEMENT = "export_statement";
const CONST_KEYWORD = "const";
const VARIABLE_DECLARATOR = "variable_declarator";
const TYPE_IDENTIFIER = "type_identifier";

const FUNCTION_DECLARATION = "function_declaration";

// Initializers that make an `export const NAME = …` a *function*, not an inert value:
// `() => …`, `function () {}`, generators. Anything else (object, literal, call) stays a const.
const FUNCTION_VALUE_TYPES: ReadonlySet<string> = new Set([
  "arrow_function",
  "function",
  "function_expression",
  "generator_function",
]);

// Handles .ts/.mts/.cts and .tsx (the grammars share this extractor).
export class TypeScriptExtractor extends AbstractExtractor {
  protected classKind(nodeType: string): ClassKind | null {
    return KIND_BY_NODE_TYPE[nodeType] ?? null;
  }

  // Top-level `function foo()` / `export function foo()` — the behaviors of a
  // module node when a file (e.g. a composition root) declares no class.
  topLevelBehaviors(rootNode: TsNode, _relativeFile: string): readonly Behavior[] {
    const behaviors: Behavior[] = [];
    for (const declaration of this.topLevelDeclarations(rootNode)) {
      if (declaration.type === FUNCTION_DECLARATION) {
        behaviors.push(this.readFunction(declaration));
      }
    }
    return behaviors;
  }

  private topLevelDeclarations(rootNode: TsNode): TsNode[] {
    const declarations: TsNode[] = [];
    for (const child of rootNode.namedChildren) {
      if (child.type === EXPORT_STATEMENT) {
        declarations.push(...child.namedChildren);
      } else {
        declarations.push(child);
      }
    }
    return declarations;
  }

  private readFunction(functionNode: TsNode): Behavior {
    return {
      name: fieldText(functionNode, "name"),
      visibility: "public",
      isStatic: false,
      returnType: this.typeText(functionNode.childForFieldName("return_type")) || "void",
      params: this.readParameters(functionNode.childForFieldName("parameters")),
      line: functionNode.startPosition.row + 1,
      endLine: functionNode.endPosition.row + 1,
    };
  }

  protected readClass(node: TsNode, kind: ClassKind, relativeFile: string): ParsedClass | null {
    if (kind === "type") {
      return this.readTypeAlias(node, relativeFile);
    }
    if (kind === "const") {
      return this.readExportedConst(node, relativeFile);
    }
    return this.readDeclaredClass(node, kind, relativeFile);
  }

  // `export type X = ...` (and top-level `type X = ...`): a contract with no
  // behaviors; referenced type names become dependencies (edges).
  private readTypeAlias(typeNode: TsNode, relativeFile: string): ParsedClass | null {
    if (!this.isTopLevelType(typeNode)) {
      return null;
    }
    const nameNode = typeNode.childForFieldName("name");
    if (!nameNode) {
      return null;
    }
    const dependencies: Dependency[] = [];
    for (const referenced of this.referencedTypeNames(typeNode.childForFieldName("value"))) {
      this.pushDependency(dependencies, referenced, "field", referenced);
    }
    return { name: nameNode.text, kind: "type", file: relativeFile, line: typeNode.startPosition.row + 1, dependencies, behaviors: [] };
  }

  // Only top-level `export const NAME = ...`. A function-valued initializer
  // (`= () => …` / `= function () {}`) is surfaced as a *function* node carrying that
  // function as its single behavior, so its signature, complexity and flow are read
  // like any method — instead of a hollow `const`. Everything else (objects, literals,
  // schemas) stays a const. Local consts inside functions are ignored.
  private readExportedConst(lexicalNode: TsNode, relativeFile: string): ParsedClass | null {
    if (!this.isExportedConst(lexicalNode)) {
      return null;
    }
    const declarator = lexicalNode.namedChildren.find((child) => child.type === VARIABLE_DECLARATOR);
    const nameNode = declarator?.childForFieldName("name");
    if (!nameNode) {
      return null;
    }
    const line = lexicalNode.startPosition.row + 1;
    const value = declarator?.childForFieldName("value") ?? null;
    if (value && FUNCTION_VALUE_TYPES.has(value.type)) {
      return {
        name: nameNode.text,
        kind: "function",
        file: relativeFile,
        line,
        dependencies: [],
        behaviors: [this.readValueFunction(nameNode.text, value, lexicalNode)],
      };
    }
    return { name: nameNode.text, kind: "const", file: relativeFile, line, dependencies: [], behaviors: [] };
  }

  // The function bound to a const: its signature plus the *whole declaration*'s line span
  // (so the complexity/flow pass slices the entire `const f = () => { … }` body).
  private readValueFunction(name: string, functionNode: TsNode, lexicalNode: TsNode): Behavior {
    const parametersNode = functionNode.childForFieldName("parameters");
    const params = parametersNode ? this.readParameters(parametersNode) : this.singleArrowParam(functionNode);
    return {
      name,
      visibility: "public",
      isStatic: false,
      returnType: this.typeText(functionNode.childForFieldName("return_type")) || "void",
      params,
      line: lexicalNode.startPosition.row + 1,
      endLine: lexicalNode.endPosition.row + 1,
    };
  }

  // A parenthesis-less single arrow param (`x => …`) has no formal_parameters node;
  // the binding sits on the `parameter` field instead.
  private singleArrowParam(functionNode: TsNode): Parameter[] {
    const single = functionNode.childForFieldName("parameter");
    return single ? [{ name: single.text, type: "" }] : [];
  }

  private isTopLevelType(typeNode: TsNode): boolean {
    const parentType = typeNode.parent?.type;
    return parentType === EXPORT_STATEMENT || parentType === "program";
  }

  private isExportedConst(lexicalNode: TsNode): boolean {
    const isExported = lexicalNode.parent?.type === EXPORT_STATEMENT;
    const hasConstKeyword = lexicalNode.children.some((child) => !child.isNamed && child.text === CONST_KEYWORD);
    return isExported && hasConstKeyword;
  }

  private referencedTypeNames(valueNode: TsNode | null): string[] {
    if (!valueNode) {
      return [];
    }
    const names = new Set<string>();
    const stack: TsNode[] = [valueNode];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      if (current.type === TYPE_IDENTIFIER) {
        names.add(current.text);
      }
      for (const child of current.namedChildren) {
        stack.push(child);
      }
    }
    return [...names];
  }

  private readDeclaredClass(classNode: TsNode, kind: ClassKind, relativeFile: string): ParsedClass | null {
    const nameNode = classNode.childForFieldName("name");
    if (!nameNode) {
      return null;
    }

    const dependencies: Dependency[] = [];
    const behaviors: Behavior[] = [];

    const body = classNode.childForFieldName("body");
    body?.namedChildren.forEach((member) => this.collectMember(member, dependencies, behaviors));

    return {
      name: nameNode.text,
      kind,
      file: relativeFile,
      line: classNode.startPosition.row + 1,
      dependencies,
      behaviors,
    };
  }

  // One class-body member → a field/constructor dependency or a behavior. Guard-style
  // early returns; constructor params fold in via forEach (no nested loops).
  private collectMember(member: TsNode, dependencies: Dependency[], behaviors: Behavior[]): void {
    if (member.type === "public_field_definition" || member.type === "property_signature") {
      this.pushDependency(dependencies, this.typeText(member.childForFieldName("type")), "field", fieldText(member, "name"));
      return;
    }
    if (member.type !== "method_definition" && member.type !== "method_signature") {
      return;
    }
    if (fieldText(member, "name") !== "constructor") {
      behaviors.push(this.readBehavior(member));
      return;
    }
    this.readParameters(member.childForFieldName("parameters")).forEach((param) =>
      this.pushDependency(dependencies, param.type, "constructor", param.name)
    );
  }

  // A type_annotation node is `: SomeType`; the real type is its first named child.
  private typeText(typeAnnotationNode: TsNode | null): string {
    if (!typeAnnotationNode) {
      return "";
    }
    const inner = typeAnnotationNode.namedChildren[0];
    return inner ? inner.text : typeAnnotationNode.text.replace(/^:\s*/, "");
  }

  private modifierText(node: TsNode): string {
    const accessibility = firstChildOfType(node, "accessibility_modifier");
    const keywords = node.children
      .filter((child) => !child.isNamed)
      .map((child) => child.text)
      .join(" ");
    return `${accessibility ? accessibility.text : ""} ${keywords}`;
  }

  private readParameters(formalParametersNode: TsNode | null): Parameter[] {
    if (!formalParametersNode) {
      return [];
    }
    const parameters: Parameter[] = [];
    for (const param of formalParametersNode.namedChildren) {
      if (param.type !== "required_parameter" && param.type !== "optional_parameter") {
        continue;
      }
      const pattern = param.childForFieldName("pattern");
      parameters.push({
        name: pattern ? pattern.text : "",
        type: this.typeText(param.childForFieldName("type")),
      });
    }
    return parameters;
  }

  private readBehavior(methodNode: TsNode): Behavior {
    const modifiers = this.modifierText(methodNode);
    return {
      name: fieldText(methodNode, "name"),
      visibility: visibilityFrom(modifiers),
      isStatic: modifiers.includes("static"),
      returnType: this.typeText(methodNode.childForFieldName("return_type")) || "void",
      params: this.readParameters(methodNode.childForFieldName("parameters")),
      line: methodNode.startPosition.row + 1,
      endLine: methodNode.endPosition.row + 1,
    };
  }

  private pushDependency(
    dependencies: Dependency[],
    type: string,
    source: Dependency["source"],
    name: string
  ): void {
    if (!type) {
      return;
    }
    dependencies.push({ name, type, baseType: baseTypeName(type), source });
  }
}
