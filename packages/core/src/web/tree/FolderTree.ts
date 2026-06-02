import type { AppState } from "../state/AppState";
import type { Emitter } from "../Emitter";
import type { Behavior, TreeFolder } from "../types";
import { byId, closestEl, escapeHtml, qsa } from "../dom";
import { folderColor, roleColorHex } from "../graph/roleColors";
import { t } from "../i18n";

const BEHAVIORLESS_KINDS: ReadonlySet<string> = new Set([
  "enum",
  "type",
  "const",
  "function",
  "annotation",
  "delegate",
  "module",
  "config",
  "file",
]);

// Kinds with no methods: they can't gain a behavior nor receive a dragged one.
function isBehaviorlessKind(kind: string): boolean {
  return BEHAVIORLESS_KINDS.has(kind);
}

// VS-style collapsible tree (folders > classes > behaviors): build, render, and
// interactions. Emits form/move intents; reveals folders on request.
export class FolderTree {
  private readonly tree = byId("tree");
  private dragData: { behavior: string; class: string; file: string } | null = null;

  constructor(
    private readonly state: AppState,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    this.setupClicks();
    this.setupDragDrop();
  }

  render(): void {
    const rootActions = `<div class="tree-root-actions">
      <button class="row-btn new-file-btn">${t("create.fileBtn")}</button>
      <button class="row-btn new-folder-btn">${t("create.folderBtn")}</button>
    </div>`;
    this.tree.innerHTML = `<div class="tree-root">${rootActions}${this.renderKindFilter()}${this.renderFolderNode(this.buildTree())}</div>`;
  }

  // A toggle chip per kind present in the graph. Clicking one hides every node of that kind
  // from the tree, so the const/file/config noise can be dialled down to focus on classes.
  private renderKindFilter(): string {
    const kinds = [...new Set(this.state.nodes.map((node) => node.kind))].sort();
    if (kinds.length <= 1) {
      return ""; // nothing to filter when the repo has a single kind
    }
    const chips = kinds
      .map((kind) => {
        const off = this.state.hiddenKinds.has(kind);
        return `<button type="button" class="kind-chip${off ? " off" : ""}" data-kind-toggle="${escapeHtml(kind)}">
          <span class="kind-badge kind-${kind}">${escapeHtml(kind)}</span>
        </button>`;
      })
      .join("");
    return `<div class="tree-kind-filter"><span class="tree-kind-filter-label">${t("tree.kindFilter")}</span>${chips}</div>`;
  }

  applySearch(): void {
    const query = this.state.searchQuery;
    const hidden = this.state.hiddenKinds;
    const filtering = Boolean(query) || hidden.size > 0;
    for (const classRow of qsa<HTMLElement>(this.tree, ".tree-class")) {
      const nameMatches = !query || (classRow.dataset.name ?? "").includes(query);
      const kindShown = !hidden.has(classRow.dataset.kind ?? "");
      classRow.classList.toggle("hidden", !kindShown || (Boolean(query) && !nameMatches));
    }
    for (const folder of qsa<HTMLElement>(this.tree, ".tree-folder")) {
      const hasVisible = folder.querySelector(".tree-class:not(.hidden)");
      folder.classList.toggle("hidden", filtering && !hasVisible);
    }
  }

  revealFolder(dir: string): void {
    const segments = dir === "." ? [] : dir.split("/");
    let scope: ParentNode = this.tree;
    let lastRow: HTMLElement | null = null;
    for (const segment of segments) {
      const rows = qsa<HTMLElement>(
        scope,
        ":scope > .tree-folder > .tree-folder-row, :scope > .tree-root > .tree-folder > .tree-folder-row"
      );
      const match = rows.find((row) => row.querySelector(".tree-folder-name")?.textContent === segment);
      if (!match || !match.parentElement) {
        break;
      }
      match.parentElement.classList.remove("collapsed");
      lastRow = match;
      const children = match.parentElement.querySelector<HTMLElement>(".tree-children");
      if (!children) {
        break;
      }
      scope = children;
    }
    if (lastRow) {
      lastRow.scrollIntoView({ block: "center" });
      lastRow.classList.remove("flash");
      void lastRow.offsetWidth;
      lastRow.classList.add("flash");
    }
  }

  private buildTree(): TreeFolder {
    const root: TreeFolder = { name: "", path: "", folders: new Map(), classes: [] };
    const ensureFolder = (relativeDir: string): TreeFolder => {
      if (!relativeDir || relativeDir === ".") {
        return root;
      }
      let current = root;
      for (const segment of relativeDir.split("/")) {
        let next = current.folders.get(segment);
        if (!next) {
          next = {
            name: segment,
            path: current.path ? `${current.path}/${segment}` : segment,
            folders: new Map(),
            classes: [],
          };
          current.folders.set(segment, next);
        }
        current = next;
      }
      return current;
    };
    for (const directory of this.state.directories) {
      ensureFolder(directory);
    }
    for (const node of this.state.nodes) {
      ensureFolder(node.dir).classes.push(node);
    }
    return root;
  }

  private classCountIn(folder: TreeFolder): number {
    let count = folder.classes.length;
    for (const child of folder.folders.values()) {
      count += this.classCountIn(child);
    }
    return count;
  }

  private hasGoTypes(folder: TreeFolder): boolean {
    return folder.classes.some((c) => c.language === "go");
  }

  private behaviorSignature(behavior: Behavior): string {
    const params = behavior.params
      .map((param) => `${escapeHtml(param.name)}: ${escapeHtml(param.type)}`)
      .join(", ");
    return `<span class="behavior-name">${escapeHtml(behavior.name)}</span><span class="behavior-params">(${params})</span> <span class="behavior-return">${escapeHtml(
      behavior.returnType
    )}</span>`;
  }

  private behaviorSignaturePlain(behavior: Behavior): string {
    const params = behavior.params.map((param) => `${param.name}: ${param.type}`).join(", ");
    return `${behavior.name}(${params}): ${behavior.returnType}`;
  }

  private renderFolderNode(folder: TreeFolder): string {
    const folderEntries = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
    const classEntries = [...folder.classes].sort((a, b) => a.name.localeCompare(b.name));
    return [
      ...folderEntries.map((child) => {
        const color = folderColor(child.name);
        const goPkg = this.hasGoTypes(child);
        return `<div class="tree-folder">
          <div class="tree-row tree-folder-row" data-path="${escapeHtml(child.path)}" style="border-left:3px solid ${color.accent}">
            <span class="tree-caret">▾</span>
            <span class="tree-folder-name">${escapeHtml(child.name)}</span>${goPkg ? '<span class="go-pkg-badge">pkg</span>' : ""}
            <span class="tree-count">${this.classCountIn(child)}</span>
            <button class="row-btn new-file-btn">${t("create.fileBtn")}</button>
            <button class="row-btn new-folder-btn">${t("create.folderBtn")}</button>
          </div>
          <div class="tree-children">${this.renderFolderNode(child)}</div>
        </div>`;
      }),
      ...classEntries.map((node) => {
        const behaviors = node.behaviors
          .map(
            (behavior) =>
              `<div class="behavior" draggable="true" data-behavior="${escapeHtml(
                behavior.name
              )}" data-line="${behavior.line || 0}" data-endline="${behavior.endLine || 0}" data-signature="${escapeHtml(
                this.behaviorSignaturePlain(behavior)
              )}"><span class="vis-dot vis-${behavior.visibility}"></span><span class="behavior-sig">${this.behaviorSignature(
                behavior
              )}</span></div>`
          )
          .join("");
        return `<div class="tree-class" data-name="${escapeHtml(
          node.name.toLowerCase()
        )}" data-class="${escapeHtml(node.name)}" data-kind="${escapeHtml(node.kind)}" data-file="${escapeHtml(
          node.file
        )}" data-line="${node.line || 1}">
          <div class="tree-row tree-class-row" style="border-left:3px solid ${roleColorHex(node.name)}">
            <span class="tree-caret ${node.behaviors.length ? "" : "empty"}">▸</span>
            <span class="kind-badge kind-${node.kind}">${node.kind}</span>
            <span class="tree-class-name">${escapeHtml(node.name)}</span>
            <span class="tree-count">${node.behaviors.length}</span>
            <button class="row-btn vscode-btn" title="${t("vscode.open")}">VS Code</button>
            ${isBehaviorlessKind(node.kind) ? "" : `<button class="row-btn add-behavior-btn">${t("addbeh.btn")}</button>`}
          </div>
          <div class="tree-behaviors">${behaviors || '<div class="tree-empty">no public behaviors</div>'}</div>
        </div>`;
      }),
    ].join("");
  }

  private openInVsCode(file: string, line: string): void {
    this.bus.emit("file:open", { file, line });
  }

  private setupClicks(): void {
    this.tree.addEventListener("click", (event) => {
      const kindChip = closestEl<HTMLElement>(event.target, ".kind-chip");
      if (kindChip) {
        event.stopPropagation();
        const kind = kindChip.dataset.kindToggle ?? "";
        if (this.state.hiddenKinds.has(kind)) {
          this.state.hiddenKinds.delete(kind);
        } else {
          this.state.hiddenKinds.add(kind);
        }
        kindChip.classList.toggle("off", this.state.hiddenKinds.has(kind));
        this.applySearch();
        return;
      }
      const vscodeButton = closestEl(event.target, ".vscode-btn");
      if (vscodeButton) {
        event.stopPropagation();
        const owner = closestEl<HTMLElement>(vscodeButton, ".tree-class");
        if (owner) {
          this.openInVsCode(owner.dataset.file ?? "", owner.dataset.line ?? "");
        }
        return;
      }
      const addButton = closestEl(event.target, ".add-behavior-btn");
      if (addButton) {
        event.stopPropagation();
        const owner = closestEl<HTMLElement>(addButton, ".tree-class");
        if (owner) {
          this.bus.emit("form:behavior", { className: owner.dataset.class ?? "", file: owner.dataset.file ?? "" });
        }
        return;
      }
      const newFileButton = closestEl(event.target, ".new-file-btn");
      if (newFileButton) {
        event.stopPropagation();
        const row = closestEl<HTMLElement>(newFileButton, ".tree-folder-row");
        this.bus.emit("form:create", { kind: "file", dir: row ? row.dataset.path ?? "" : "" });
        return;
      }
      const newFolderButton = closestEl(event.target, ".new-folder-btn");
      if (newFolderButton) {
        event.stopPropagation();
        const row = closestEl<HTMLElement>(newFolderButton, ".tree-folder-row");
        this.bus.emit("form:create", { kind: "folder", dir: row ? row.dataset.path ?? "" : "" });
        return;
      }
      const behaviorRow = closestEl<HTMLElement>(event.target, ".behavior");
      if (behaviorRow) {
        const owner = closestEl<HTMLElement>(behaviorRow, ".tree-class");
        if (owner) {
          this.bus.emit("behavior:open", {
            className: owner.dataset.class ?? "",
            file: owner.dataset.file ?? "",
            behavior: behaviorRow.dataset.behavior ?? "",
            line: behaviorRow.dataset.line ?? "0",
            endLine: behaviorRow.dataset.endline ?? "0",
            signature: behaviorRow.dataset.signature ?? "",
          });
        }
        return;
      }
      const folderRow = closestEl<HTMLElement>(event.target, ".tree-folder-row");
      if (folderRow && folderRow.parentElement) {
        folderRow.parentElement.classList.toggle("collapsed");
        return;
      }
      const classRow = closestEl<HTMLElement>(event.target, ".tree-class-row");
      if (classRow && classRow.parentElement) {
        classRow.parentElement.classList.toggle("expanded");
      }
    });
  }

  private setupDragDrop(): void {
    this.tree.addEventListener("dragstart", (event) => {
      const behavior = closestEl<HTMLElement>(event.target, ".behavior");
      if (!behavior) {
        return;
      }
      const owner = closestEl<HTMLElement>(behavior, ".tree-class");
      if (!owner || isBehaviorlessKind(owner.dataset.kind ?? "")) {
        return;
      }
      this.dragData = {
        behavior: behavior.dataset.behavior ?? "",
        class: owner.dataset.class ?? "",
        file: owner.dataset.file ?? "",
      };
      behavior.classList.add("dragging");
    });

    this.tree.addEventListener("dragend", (event) => {
      const behavior = closestEl<HTMLElement>(event.target, ".behavior");
      if (behavior) {
        behavior.classList.remove("dragging");
      }
      this.dragData = null;
    });

    this.tree.addEventListener("dragover", (event) => {
      const target = closestEl<HTMLElement>(event.target, ".tree-class");
      if (!target || !this.dragData || isBehaviorlessKind(target.dataset.kind ?? "")) {
        return;
      }
      event.preventDefault();
      target.classList.add("drop-target");
    });

    this.tree.addEventListener("dragleave", (event) => {
      const target = closestEl<HTMLElement>(event.target, ".tree-class");
      if (target) {
        target.classList.remove("drop-target");
      }
    });

    this.tree.addEventListener("drop", (event) => {
      const target = closestEl<HTMLElement>(event.target, ".tree-class");
      if (!target || !this.dragData || isBehaviorlessKind(target.dataset.kind ?? "")) {
        return;
      }
      event.preventDefault();
      target.classList.remove("drop-target");
      if (target.dataset.class === this.dragData.class && target.dataset.file === this.dragData.file) {
        return;
      }
      this.bus.emit("task:move", {
        from: { class: this.dragData.class, file: this.dragData.file, behavior: this.dragData.behavior },
        to: { class: target.dataset.class ?? "", file: target.dataset.file ?? "" },
      });
    });
  }
}
