import { AbstractExtractor } from "./abstractExtractor";
import { baseTypeName, fieldText, firstChildOfType, visibilityFrom } from "../ast";
import { Behavior, ClassKind, Dependency, Parameter, ParsedClass, TsNode } from "../types";

const KIND_BY_NODE_TYPE: Readonly<Record<string, ClassKind>> = {
  class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
  record_declaration: "record",
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
    const recordComponents = classNode.childForFieldName("parameters");
    if (recordComponents) {
      for (const param of this.readParameters(recordComponents)) {
        dependencies.push({ ...param, baseType: baseTypeName(param.type), source: "constructor" });
      }
    }

    const body = classNode.childForFieldName("body");
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === "field_declaration") {
          const typeNode = member.childForFieldName("type");
          const declarator = firstChildOfType(member, "variable_declarator");
          const fieldName = declarator ? fieldText(declarator, "name") : "";
          if (typeNode) {
            dependencies.push({
              name: fieldName,
              type: typeNode.text,
              baseType: baseTypeName(typeNode.text),
              source: "field",
            });
          }
        } else if (member.type === "constructor_declaration") {
          for (const param of this.readParameters(member.childForFieldName("parameters"))) {
            dependencies.push({ ...param, baseType: baseTypeName(param.type), source: "constructor" });
          }
        } else if (member.type === "method_declaration") {
          behaviors.push(this.readBehavior(member));
        }
      }
    }

    return {
      name: nameNode.text,
      kind,
      file: relativeFile,
      line: classNode.startPosition.row + 1,
      dependencies,
      behaviors,
    };
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
