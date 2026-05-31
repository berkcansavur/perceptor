import { TsNode, Visibility } from "./types";

// Readers over the tree-sitter syntax tree: pull child nodes, field text, the bare
// type name, and a declaration's visibility out of a parsed source node.

// Reduce a type expression to the bare identifier used for edge matching.
//   List<User>     -> List
//   com.x.UserRepo -> UserRepo
//   Ship[]         -> Ship
//   IInputService? -> IInputService
export function baseTypeName(typeText: string): string | null {
  if (!typeText) {
    return null;
  }
  let text = typeText.trim();
  const genericStart = text.indexOf("<");
  if (genericStart !== -1) {
    text = text.slice(0, genericStart);
  }
  text = text.replace(/\[\]/g, "").replace(/\?+$/g, "").trim();
  const lastDot = text.lastIndexOf(".");
  if (lastDot !== -1) {
    text = text.slice(lastDot + 1);
  }
  return text.length > 0 ? text : null;
}

export function firstChildOfType(node: TsNode, type: string): TsNode | null {
  for (const child of node.namedChildren) {
    if (child.type === type) {
      return child;
    }
  }
  return null;
}

export function childrenOfType(node: TsNode, type: string): readonly TsNode[] {
  return node.namedChildren.filter((child) => child.type === type);
}

export function fieldText(node: TsNode, field: string): string {
  const child = node.childForFieldName(field);
  return child ? child.text : "";
}

export function visibilityFrom(modifierText: string): Visibility {
  if (modifierText.includes("public")) {
    return "public";
  }
  if (modifierText.includes("protected")) {
    return "protected";
  }
  if (modifierText.includes("private")) {
    return "private";
  }
  if (modifierText.includes("internal")) {
    return "internal";
  }
  return "package";
}
