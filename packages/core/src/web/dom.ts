// Small typed DOM helpers. Elements declared in index.html are treated as
// guaranteed-present (throw if missing — a programming error, not runtime input).

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Perceptor: missing element #${id}`);
  }
  return element as T;
}

export function closestEl<T extends Element = Element>(
  target: EventTarget | null,
  selector: string
): T | null {
  return target instanceof Element ? target.closest<T>(selector) : null;
}

export function qsa<T extends Element = Element>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"]/g, (character) => HTML_ESCAPES[character] ?? character);
}
