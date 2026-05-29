"use strict";

const {
  baseTypeName,
  childrenOfType,
  visibilityFrom,
} = require("./astUtils");

const CLASS_NODE_TO_KIND = {
  class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
  struct_declaration: "struct",
  record_declaration: "record",
  record_struct_declaration: "record",
};

function modifierText(node) {
  return childrenOfType(node, "modifier")
    .map((modifier) => modifier.text)
    .join(" ");
}

function readParameters(parameterListNode) {
  if (!parameterListNode) return [];
  const parameters = [];
  for (const param of parameterListNode.namedChildren) {
    if (param.type !== "parameter") continue;
    const typeNode = param.childForFieldName("type");
    const nameNode = param.childForFieldName("name");
    parameters.push({
      name: nameNode ? nameNode.text : "",
      type: typeNode ? typeNode.text : "",
    });
  }
  return parameters;
}

function readBehavior(methodNode) {
  const nameNode = methodNode.childForFieldName("name");
  const returnNode = methodNode.childForFieldName("type");
  const modifiers = modifierText(methodNode);
  return {
    name: nameNode ? nameNode.text : "",
    visibility: visibilityFrom(modifiers),
    isStatic: modifiers.includes("static"),
    returnType: returnNode ? returnNode.text : "void",
    params: readParameters(methodNode.childForFieldName("parameters")),
  };
}

function readClass(classNode, relativeFile) {
  const nameNode = classNode.childForFieldName("name");
  if (!nameNode) return null;

  const dependencies = [];
  const behaviors = [];
  const body = classNode.childForFieldName("body");

  // positional record parameters act as constructor-style dependencies
  const recordComponents = classNode.childForFieldName("parameters");
  if (recordComponents) {
    for (const param of readParameters(recordComponents)) {
      dependencies.push({ ...param, baseType: baseTypeName(param.type), source: "constructor" });
    }
  }

  if (body) {
    for (const member of body.namedChildren) {
      if (member.type === "field_declaration") {
        const variableDeclaration = member.namedChildren.find(
          (child) => child.type === "variable_declaration"
        );
        const typeNode = variableDeclaration
          ? variableDeclaration.childForFieldName("type")
          : null;
        if (typeNode) {
          dependencies.push({
            name: "",
            type: typeNode.text,
            baseType: baseTypeName(typeNode.text),
            source: "field",
          });
        }
      } else if (member.type === "property_declaration") {
        const typeNode = member.childForFieldName("type");
        if (typeNode) {
          dependencies.push({
            name: (member.childForFieldName("name") || {}).text || "",
            type: typeNode.text,
            baseType: baseTypeName(typeNode.text),
            source: "field",
          });
        }
      } else if (member.type === "constructor_declaration") {
        for (const param of readParameters(member.childForFieldName("parameters"))) {
          dependencies.push({ ...param, baseType: baseTypeName(param.type), source: "constructor" });
        }
      } else if (member.type === "method_declaration") {
        behaviors.push(readBehavior(member));
      }
    }
  }

  return {
    name: nameNode.text,
    kind: CLASS_NODE_TO_KIND[classNode.type] || "class",
    file: relativeFile,
    line: classNode.startPosition.row + 1,
    dependencies,
    behaviors,
  };
}

function extract(rootNode, relativeFile) {
  const classes = [];
  const stack = [rootNode];
  while (stack.length) {
    const node = stack.pop();
    if (CLASS_NODE_TO_KIND[node.type]) {
      const parsed = readClass(node, relativeFile);
      if (parsed) classes.push(parsed);
    }
    for (const child of node.namedChildren) stack.push(child);
  }
  return classes;
}

module.exports = { extract };
