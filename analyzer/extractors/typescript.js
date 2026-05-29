"use strict";

const { baseTypeName, firstChildOfType, visibilityFrom } = require("./astUtils");

const CLASS_NODE_TO_KIND = {
  class_declaration: "class",
  abstract_class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
};

// A type_annotation node is `: SomeType`; the real type is its first named child.
function typeText(typeAnnotationNode) {
  if (!typeAnnotationNode) return "";
  const inner = typeAnnotationNode.namedChildren[0];
  return inner ? inner.text : typeAnnotationNode.text.replace(/^:\s*/, "");
}

function modifierText(node) {
  const accessibility = firstChildOfType(node, "accessibility_modifier");
  const keywords = node.children
    .filter((child) => !child.isNamed)
    .map((child) => child.text)
    .join(" ");
  return `${accessibility ? accessibility.text : ""} ${keywords}`;
}

function readParameters(formalParametersNode) {
  if (!formalParametersNode) return [];
  const parameters = [];
  for (const param of formalParametersNode.namedChildren) {
    if (param.type !== "required_parameter" && param.type !== "optional_parameter") {
      continue;
    }
    const pattern = param.childForFieldName("pattern");
    parameters.push({
      name: pattern ? pattern.text : "",
      type: typeText(param.childForFieldName("type")),
    });
  }
  return parameters;
}

function readBehavior(methodNode) {
  const nameNode = methodNode.childForFieldName("name");
  const modifiers = modifierText(methodNode);
  return {
    name: nameNode ? nameNode.text : "",
    visibility: visibilityFrom(modifiers),
    isStatic: modifiers.includes("static"),
    returnType: typeText(methodNode.childForFieldName("return_type")) || "void",
    params: readParameters(methodNode.childForFieldName("parameters")),
  };
}

function pushDependency(dependencies, type, source, name) {
  if (!type) return;
  dependencies.push({ name: name || "", type, baseType: baseTypeName(type), source });
}

function readClass(classNode, relativeFile) {
  const nameNode = classNode.childForFieldName("name");
  if (!nameNode) return null;

  const dependencies = [];
  const behaviors = [];
  const body = classNode.childForFieldName("body");

  if (body) {
    for (const member of body.namedChildren) {
      if (member.type === "public_field_definition" || member.type === "property_signature") {
        const name = (member.childForFieldName("name") || {}).text || "";
        pushDependency(dependencies, typeText(member.childForFieldName("type")), "field", name);
      } else if (member.type === "method_definition" || member.type === "method_signature") {
        const memberName = (member.childForFieldName("name") || {}).text;
        if (memberName === "constructor") {
          for (const param of readParameters(member.childForFieldName("parameters"))) {
            pushDependency(dependencies, param.type, "constructor", param.name);
          }
        } else {
          behaviors.push(readBehavior(member));
        }
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
