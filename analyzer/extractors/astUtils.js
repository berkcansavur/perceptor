"use strict";

// Reduce a type expression to the bare type identifier used for edge matching.
//   List<User>      -> List
//   com.x.UserRepo  -> UserRepo
//   Ship[]          -> Ship
//   IInputService?  -> IInputService
function baseTypeName(typeText) {
  if (!typeText) return null;
  let text = typeText.trim();
  const genericStart = text.indexOf("<");
  if (genericStart !== -1) text = text.slice(0, genericStart);
  text = text.replace(/\[\]/g, "").replace(/\?+$/g, "").trim();
  const lastDot = text.lastIndexOf(".");
  if (lastDot !== -1) text = text.slice(lastDot + 1);
  return text || null;
}

function firstChildOfType(node, type) {
  for (const child of node.namedChildren) {
    if (child.type === type) return child;
  }
  return null;
}

function childrenOfType(node, type) {
  return node.namedChildren.filter((child) => child.type === type);
}

function visibilityFrom(modifierText) {
  if (!modifierText) return "package";
  if (modifierText.includes("public")) return "public";
  if (modifierText.includes("protected")) return "protected";
  if (modifierText.includes("private")) return "private";
  if (modifierText.includes("internal")) return "internal";
  return "package";
}

module.exports = {
  baseTypeName,
  firstChildOfType,
  childrenOfType,
  visibilityFrom,
};
