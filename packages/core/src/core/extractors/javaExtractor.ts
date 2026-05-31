import { AbstractExtractor } from "./AbstractExtractor";
import { baseTypeName, fieldText, firstChildOfType, visibilityFrom } from "../syntaxTree";
import { Behavior, ClassKind, Dependency, Parameter, ParsedClass, TsNode } from "../types";

const KIND_BY_NODE_TYPE: Readonly<Record<string, ClassKind>> = {
  class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
  record_declaration: "record",
  annotation_type_declaration: "annotation",
};

export class JavaExtractor extends AbstractExtractor {
  protected classKind(nodeType: string): ClassKind | null {
    return KIND_BY_NODE_TYPE[nodeType] ?? null;
  }

  protected readClass(classNode: TsNode, kind: ClassKind, relativeFile: string): ParsedClass | null {
    const nameNode = classNode.childForFieldName("name");
    if (!nameNode) {
      return null;
    }

    const dependencies: Dependency[] = [];
    const behaviors: Behavior[] = [];

    // record components act as constructor-style dependencies
    this.pushConstructorParams(classNode.childForFieldName("parameters"), dependencies);

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

  // One class-body member → a field dependency, constructor params, or a behavior.
  // Guard-style returns; no nested loops.
  private collectMember(member: TsNode, dependencies: Dependency[], behaviors: Behavior[]): void {
    if (member.type === "field_declaration") {
      const typeNode = member.childForFieldName("type");
      const declarator = firstChildOfType(member, "variable_declarator");
      const fieldName = declarator ? fieldText(declarator, "name") : "";
      if (typeNode) {
        dependencies.push({ name: fieldName, type: typeNode.text, baseType: baseTypeName(typeNode.text), source: "field" });
      }
      return;
    }
    if (member.type === "constructor_declaration") {
      this.pushConstructorParams(member.childForFieldName("parameters"), dependencies);
      return;
    }
    if (member.type === "method_declaration") {
      behaviors.push(this.readBehavior(member));
    }
  }

  // Each parameter of a constructor / positional record → a constructor dependency.
  private pushConstructorParams(parametersNode: TsNode | null, dependencies: Dependency[]): void {
    this.readParameters(parametersNode).forEach((param) =>
      dependencies.push({ ...param, baseType: baseTypeName(param.type), source: "constructor" })
    );
  }

  private modifierText(node: TsNode): string {
    const modifiers = firstChildOfType(node, "modifiers");
    return modifiers ? modifiers.text : "";
  }

  private readParameters(parameterListNode: TsNode | null): Parameter[] {
    if (!parameterListNode) {
      return [];
    }
    const parameters: Parameter[] = [];
    for (const param of parameterListNode.namedChildren) {
      if (param.type !== "formal_parameter" && param.type !== "spread_parameter") {
        continue;
      }
      parameters.push({ name: fieldText(param, "name"), type: fieldText(param, "type") });
    }
    return parameters;
  }

  private readBehavior(methodNode: TsNode): Behavior {
    const modifiers = this.modifierText(methodNode);
    const returnNode = methodNode.childForFieldName("type");
    return {
      name: fieldText(methodNode, "name"),
      visibility: visibilityFrom(modifiers),
      isStatic: modifiers.includes("static"),
      returnType: returnNode ? returnNode.text : "void",
      params: this.readParameters(methodNode.childForFieldName("parameters")),
      line: methodNode.startPosition.row + 1,
      endLine: methodNode.endPosition.row + 1,
    };
  }
}
