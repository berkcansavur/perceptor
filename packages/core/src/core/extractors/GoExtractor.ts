import { AbstractExtractor } from "./AbstractExtractor";
import { baseTypeName, childrenOfType, fieldText, firstChildOfType } from "../syntaxTree";
import { Behavior, ClassKind, Dependency, Parameter, ParsedClass, TsNode, Visibility } from "../types";

export class GoExtractor extends AbstractExtractor {
  protected classKind(nodeType: string): ClassKind | null {
    return nodeType === "type_spec" ? "struct" : null;
  }

  protected readClass(node: TsNode, _kind: ClassKind, relativeFile: string): ParsedClass | null {
    const typeBody = node.childForFieldName("type");
    if (!typeBody) {
      return null;
    }
    if (typeBody.type === "struct_type") {
      return this.readStruct(node, typeBody, relativeFile);
    }
    if (typeBody.type === "interface_type") {
      return this.readInterface(node, typeBody, relativeFile);
    }
    return null;
  }

  // Go methods live outside the struct body (receiver functions), so the base
  // class walk collects only struct/interface shells. This override attaches
  // method_declarations to their receiver struct in a second pass.
  override extract(rootNode: TsNode, relativeFile: string): readonly ParsedClass[] {
    const parsedTypes = [...super.extract(rootNode, relativeFile)];

    const methodsByReceiver = new Map<string, Behavior[]>();
    rootNode.namedChildren.forEach((child) => {
      if (child.type !== "method_declaration") {
        return;
      }
      const receiverType = this.receiverTypeName(child);
      if (!receiverType) {
        return;
      }
      const methods = methodsByReceiver.get(receiverType) ?? [];
      methods.push(this.readMethodDeclaration(child));
      methodsByReceiver.set(receiverType, methods);
    });

    return parsedTypes.map((parsed) => {
      const methods = methodsByReceiver.get(parsed.name);
      if (!methods || methods.length === 0) {
        return parsed;
      }
      return { ...parsed, behaviors: [...parsed.behaviors, ...methods] };
    });
  }

  topLevelBehaviors(rootNode: TsNode, _relativeFile: string): readonly Behavior[] {
    const behaviors: Behavior[] = [];
    for (const child of rootNode.namedChildren) {
      if (child.type === "function_declaration") {
        behaviors.push(this.readFunctionDeclaration(child));
      }
    }
    return behaviors;
  }

  private readStruct(typeSpec: TsNode, structType: TsNode, relativeFile: string): ParsedClass {
    const dependencies: Dependency[] = [];
    const fieldList = firstChildOfType(structType, "field_declaration_list");
    fieldList?.namedChildren.forEach((field) => {
      if (field.type === "field_declaration") {
        this.collectStructField(field, dependencies);
      }
    });
    return {
      name: fieldText(typeSpec, "name"),
      kind: "struct",
      file: relativeFile,
      line: typeSpec.startPosition.row + 1,
      dependencies,
      behaviors: [],
    };
  }

  private readInterface(typeSpec: TsNode, interfaceType: TsNode, relativeFile: string): ParsedClass {
    const behaviors: Behavior[] = [];
    const dependencies: Dependency[] = [];
    for (const child of interfaceType.namedChildren) {
      if (child.type === "method_spec" || child.type === "method_elem") {
        behaviors.push(this.readMethodSpec(child));
        continue;
      }
      if (child.type === "type_identifier" || child.type === "qualified_type") {
        dependencies.push({ name: child.text, type: child.text, baseType: baseTypeName(child.text), source: "field" });
      }
    }
    return {
      name: fieldText(typeSpec, "name"),
      kind: "interface",
      file: relativeFile,
      line: typeSpec.startPosition.row + 1,
      dependencies,
      behaviors,
    };
  }

  private collectStructField(field: TsNode, dependencies: Dependency[]): void {
    const typeNode = field.childForFieldName("type");
    if (!typeNode) {
      return;
    }
    const typeText = typeNode.text;
    const resolvedType = this.resolveBaseType(typeNode);
    const names = childrenOfType(field, "field_identifier");
    if (names.length === 0) {
      dependencies.push({ name: resolvedType ?? typeText, type: typeText, baseType: resolvedType, source: "field" });
      return;
    }
    names.forEach((nameNode) =>
      dependencies.push({ name: nameNode.text, type: typeText, baseType: resolvedType, source: "field" })
    );
  }

  private resolveBaseType(typeNode: TsNode): string | null {
    return baseTypeName(this.unwrapTypeName(typeNode));
  }

  private unwrapTypeName(typeNode: TsNode): string {
    const inner = typeNode.namedChildren[0];
    switch (typeNode.type) {
      case "pointer_type":
      case "slice_type":
      case "array_type":
        return inner ? this.unwrapTypeName(inner) : typeNode.text;
      case "channel_type":
        return inner ? this.unwrapTypeName(inner) : typeNode.text;
      case "qualified_type": {
        const name = typeNode.childForFieldName("name");
        return name ? name.text : typeNode.text;
      }
      case "map_type": {
        const value = typeNode.childForFieldName("value");
        return value ? this.unwrapTypeName(value) : typeNode.text;
      }
      default:
        return typeNode.text;
    }
  }

  private receiverTypeName(methodDecl: TsNode): string | null {
    const receiver = methodDecl.childForFieldName("receiver");
    const paramDecl = receiver ? firstChildOfType(receiver, "parameter_declaration") : null;
    const typeNode = paramDecl?.childForFieldName("type") ?? null;
    return typeNode ? this.unwrapTypeName(typeNode) : null;
  }

  private readMethodDeclaration(methodDecl: TsNode): Behavior {
    const name = fieldText(methodDecl, "name");
    return {
      name,
      visibility: this.goVisibility(name),
      isStatic: false,
      returnType: this.resultText(methodDecl),
      params: this.readGoParameters(methodDecl.childForFieldName("parameters")),
      line: methodDecl.startPosition.row + 1,
      endLine: methodDecl.endPosition.row + 1,
    };
  }

  private readMethodSpec(spec: TsNode): Behavior {
    const name = fieldText(spec, "name");
    return {
      name,
      visibility: this.goVisibility(name),
      isStatic: false,
      returnType: this.resultText(spec),
      params: this.readGoParameters(spec.childForFieldName("parameters")),
      line: spec.startPosition.row + 1,
      endLine: spec.endPosition.row + 1,
    };
  }

  private readFunctionDeclaration(funcDecl: TsNode): Behavior {
    const name = fieldText(funcDecl, "name");
    return {
      name,
      visibility: this.goVisibility(name),
      isStatic: false,
      returnType: this.resultText(funcDecl),
      params: this.readGoParameters(funcDecl.childForFieldName("parameters")),
      line: funcDecl.startPosition.row + 1,
      endLine: funcDecl.endPosition.row + 1,
    };
  }

  private readGoParameters(paramsNode: TsNode | null): Parameter[] {
    if (!paramsNode) {
      return [];
    }
    const params: Parameter[] = [];
    for (const child of paramsNode.namedChildren) {
      if (child.type !== "parameter_declaration" && child.type !== "variadic_parameter_declaration") {
        continue;
      }
      const typeNode = child.childForFieldName("type");
      params.push({ name: fieldText(child, "name"), type: typeNode ? typeNode.text : "" });
    }
    return params;
  }

  private resultText(node: TsNode): string {
    const result = node.childForFieldName("result");
    return result ? result.text : "";
  }

  private goVisibility(name: string): Visibility {
    return /^[A-Z]/.test(name) ? "public" : "package";
  }
}
