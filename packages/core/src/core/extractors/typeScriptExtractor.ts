import { AbstractExtractor } from "./abstractExtractor";
import { baseTypeName, fieldText, firstChildOfType, visibilityFrom } from "../ast";
import { Behavior, ClassKind, Dependency, Parameter, ParsedClass, TsNode } from "../types";

const KIND_BY_NODE_TYPE: Readonly<Record<string, ClassKind>> = {
  class_declaration: "class",
  abstract_class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
};

// Handles .ts/.mts/.cts and .tsx (the grammars share this extractor).
export class TypeScriptExtractor extends AbstractExtractor {
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

    const body = classNode.childForFieldName("body");
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === "public_field_definition" || member.type === "property_signature") {
          this.pushDependency(
            dependencies,
            this.typeText(member.childForFieldName("type")),
            "field",
            fieldText(member, "name")
          );
        } else if (member.type === "method_definition" || member.type === "method_signature") {
          if (fieldText(member, "name") === "constructor") {
            for (const param of this.readParameters(member.childForFieldName("parameters"))) {
              this.pushDependency(dependencies, param.type, "constructor", param.name);
            }
          } else {
            behaviors.push(this.readBehavior(member));
          }
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
