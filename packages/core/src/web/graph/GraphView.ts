import type { AppState } from "../state/AppState";
import type { Emitter } from "../Emitter";
import type { ClassNode } from "../types";
import type { GraphModel } from "./GraphModel";
import { byId, escapeHtml, qsa } from "../dom";
import { t } from "../i18n";

const SVG_NS = "http://www.w3.org/2000/svg";

// Class-less file kinds get an icon instead of a type badge in the folder card.
const CARD_ICON: Readonly<Record<string, string>> = { file: "📄", config: "⚙", module: "ƒ" };

// Renders the folder graph (group rings + SVG edges + DOM circle nodes) and drives
// a live force simulation: pan/zoom/drag/hover, reheating physics on drag.
export class GraphView {
  private readonly viewport = byId("viewport");
  private readonly world = byId("world");
  private readonly edgesSvg = document.getElementById("edges") as unknown as SVGSVGElement;
  private readonly nodesLayer = byId("nodes");
  private readonly search = byId<HTMLInputElement>("search");
  private readonly card = byId("graph-card");
  private readonly scopeBar = byId("scope-bar");
  private readonly scopeInput = byId<HTMLInputElement>("scope-input");
  private readonly scopeError = byId("scope-error");
  private readonly scopeSuggestions = byId("scope-suggestions");
  private activeSuggestion = -1;
  private animationFrame: number | null = null;

  constructor(
    private readonly state: AppState,
    private readonly model: GraphModel,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    this.setupPanZoom();
    this.setupNodeDrag();
    this.setupHover();
    this.setupCard();
    this.setupAutoFit();
    this.setupScope();
  }

  render(): void {
    this.buildScene();
    if (!this.state.userAdjusted) {
      this.fitView();
    }
    this.startSimulation();
  }

  relayout(): void {
    this.state.userAdjusted = false;
    this.model.reseed();
    this.render();
  }

  applyView(): void {
    const { x, y, scale } = this.state.view;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    // Keep labels at a constant on-screen size regardless of zoom.
    this.world.style.setProperty("--label-counter", String(1 / scale));
  }

  fitView(): void {
    const bounds = this.model.bounds();
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const rect = this.viewport.getBoundingClientRect();
    if (width < 1 || height < 1 || rect.width < 10 || rect.height < 10) {
      return;
    }
    const scale = Math.max(0.05, Math.min(1.6, Math.min(rect.width / width, rect.height / height) * 0.9));
    this.state.view.scale = scale;
    this.state.view.x = (rect.width - width * scale) / 2 - bounds.minX * scale;
    this.state.view.y = (rect.height - height * scale) / 2 - bounds.minY * scale;
    this.applyView();
  }

  applySearch(): void {
    const query = this.state.searchQuery;
    for (const element of qsa<HTMLElement>(this.nodesLayer, ".gnode")) {
      const folder = this.state.folderByDir.get(element.dataset.dir ?? "");
      const matches =
        !query ||
        (folder &&
          (folder.label.toLowerCase().includes(query) || folder.members.some((name) => name.includes(query))));
      element.classList.toggle("dimmed", Boolean(query) && !matches);
      element.classList.toggle("highlight", Boolean(query) && Boolean(matches));
    }
  }

  private startSimulation(): void {
    if (this.animationFrame !== null) {
      return;
    }
    const step = (): void => {
      const active = this.model.tick();
      this.syncPositions();
      if (active) {
        this.animationFrame = requestAnimationFrame(step);
      } else {
        this.animationFrame = null;
        if (!this.state.userAdjusted) {
          this.fitView();
        }
      }
    };
    this.animationFrame = requestAnimationFrame(step);
  }

  private buildScene(): void {
    this.hideCard();
    this.edgesSvg.innerHTML = "";
    for (const edge of this.state.folderEdges) {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("stroke", "#5b6172");
      line.setAttribute("stroke-width", String(Math.min(5, 0.6 + edge.weight * 0.5)));
      line.setAttribute("stroke-opacity", "0.45");
      line.dataset.a = edge.a;
      line.dataset.b = edge.b;
      this.edgesSvg.appendChild(line);
    }
    this.nodesLayer.innerHTML = "";
    for (const folder of this.state.folderNodes) {
      const element = document.createElement("div");
      element.className = "gnode";
      element.dataset.dir = folder.dir;
      const diameter = folder.radius * 2;
      const badge = folder.count > 0 ? ` <span class="gdeg">${folder.count}</span>` : "";
      element.innerHTML = `
        <div class="gdot" style="width:${diameter}px;height:${diameter}px;background:${folder.color.fill};border-color:${folder.color.stroke}"></div>
        <div class="glabel" title="${escapeHtml(folder.dir)}">${escapeHtml(folder.label)}${badge}</div>`;
      this.nodesLayer.appendChild(element);
    }
    this.syncPositions();
  }

  // Per-frame: only positions move (topology is stable), so update coordinates in place.
  private syncPositions(): void {
    const position = this.state.position;
    for (const element of qsa<HTMLElement>(this.nodesLayer, ".gnode")) {
      const point = position.get(element.dataset.dir ?? "");
      if (point) {
        element.style.left = `${point.x}px`;
        element.style.top = `${point.y}px`;
      }
    }
    for (const line of qsa<SVGLineElement>(this.edgesSvg, "line")) {
      const sourcePoint = position.get(line.dataset.a ?? "");
      const targetPoint = position.get(line.dataset.b ?? "");
      if (sourcePoint && targetPoint) {
        line.setAttribute("x1", String(sourcePoint.x));
        line.setAttribute("y1", String(sourcePoint.y));
        line.setAttribute("x2", String(targetPoint.x));
        line.setAttribute("y2", String(targetPoint.y));
      }
    }
  }

  private setupPanZoom(): void {
    let panning = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    this.viewport.addEventListener("mousedown", (event) => {
      const target = event.target as Element | null;
      if (target?.closest(".gnode") || target?.closest("#graph-card")) {
        return;
      }
      this.hideCard();
      panning = true;
      this.state.userAdjusted = true;
      this.viewport.classList.add("panning");
      startX = event.clientX;
      startY = event.clientY;
      originX = this.state.view.x;
      originY = this.state.view.y;
    });

    window.addEventListener("mousemove", (event) => {
      if (!panning) {
        return;
      }
      this.state.view.x = originX + (event.clientX - startX);
      this.state.view.y = originY + (event.clientY - startY);
      this.applyView();
    });

    window.addEventListener("mouseup", () => {
      panning = false;
      this.viewport.classList.remove("panning");
    });

    this.viewport.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.hideCard();
        this.state.userAdjusted = true;
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const newScale = Math.max(0.05, Math.min(3, this.state.view.scale * factor));
        const rect = this.viewport.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        this.state.view.x = pointerX - (pointerX - this.state.view.x) * (newScale / this.state.view.scale);
        this.state.view.y = pointerY - (pointerY - this.state.view.y) * (newScale / this.state.view.scale);
        this.state.view.scale = newScale;
        this.applyView();
      },
      { passive: false }
    );
  }

  private setupNodeDrag(): void {
    let draggingDir: string | null = null;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    this.nodesLayer.addEventListener("mousedown", (event) => {
      const gnode = (event.target as Element | null)?.closest<HTMLElement>(".gnode");
      const dir = gnode?.dataset.dir ?? null;
      const position = dir ? this.state.position.get(dir) : null;
      if (!dir || !position) {
        return;
      }
      draggingDir = dir;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      originX = position.x;
      originY = position.y;
      this.hideCard();
      this.model.pin(dir, { x: position.x, y: position.y });
      this.model.reheat();
      this.startSimulation();
      event.preventDefault();
    });

    window.addEventListener("mousemove", (event) => {
      if (!draggingDir) {
        return;
      }
      const deltaX = (event.clientX - startX) / this.state.view.scale;
      const deltaY = (event.clientY - startY) / this.state.view.scale;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        moved = true;
        this.state.userAdjusted = true;
      }
      this.model.pin(draggingDir, { x: originX + deltaX, y: originY + deltaY });
      this.model.reheat();
      this.startSimulation();
    });

    window.addEventListener("mouseup", () => {
      if (!draggingDir) {
        return;
      }
      const released = draggingDir;
      this.model.unpin(released);
      if (!moved) {
        this.showCard(released);
      }
      draggingDir = null;
    });
  }

  // Click a folder node → a list card of the classes directly in it; click a class →
  // jump to the Folder view (the existing folder:open flow).
  private setupCard(): void {
    this.card.addEventListener("click", (event) => {
      const row = (event.target as Element | null)?.closest<HTMLElement>("[data-class-dir]");
      if (row) {
        this.bus.emit("folder:open", row.dataset.classDir ?? "");
        this.hideCard();
      }
    });
  }

  private showCard(dir: string): void {
    let node: HTMLElement | null = null;
    for (const element of qsa<HTMLElement>(this.nodesLayer, ".gnode")) {
      if (element.dataset.dir === dir) {
        node = element;
        break;
      }
    }
    if (!node) {
      return;
    }
    const folder = this.state.folderByDir.get(dir);
    const classes = this.model.classesIn(dir);
    const rows = classes.length
      ? classes.map((classNode) => this.cardRow(classNode)).join("")
      : `<div class="graph-card-empty muted">${escapeHtml(folder?.dir ?? dir)} — no files here</div>`;
    this.card.innerHTML = `<div class="graph-card-head">${escapeHtml(folder?.label ?? dir)} <span class="muted">${classes.length}</span></div><div class="graph-card-list">${rows}</div>`;
    const nodeRect = node.getBoundingClientRect();
    const viewportRect = this.viewport.getBoundingClientRect();
    const left = Math.min(nodeRect.right - viewportRect.left + 10, viewportRect.width - 260);
    const top = Math.min(nodeRect.top - viewportRect.top, viewportRect.height - 240);
    this.card.style.left = `${Math.max(8, left)}px`;
    this.card.style.top = `${Math.max(8, top)}px`;
    this.card.classList.remove("hidden");
  }

  // Class-less files (module/config/file) read as files, not types: a leading icon
  // and a muted/italic row so they're instantly distinct from real classes.
  private cardRow(item: ClassNode): string {
    const icon = CARD_ICON[item.kind];
    const badge = icon
      ? `<span class="graph-card-icon">${icon}</span>`
      : `<span class="graph-card-kind kind-${item.kind}">${item.kind}</span>`;
    return `<div class="graph-card-row${icon ? " graph-card-row--file" : ""}" data-class-dir="${escapeHtml(
      item.dir
    )}">${badge}${escapeHtml(item.name)}</div>`;
  }

  private hideCard(): void {
    this.card.classList.add("hidden");
  }

  private setupHover(): void {
    this.nodesLayer.addEventListener("mouseover", (event) => {
      const gnode = (event.target as Element | null)?.closest<HTMLElement>(".gnode");
      if (!gnode || this.search.value.trim()) {
        return;
      }
      const dir = gnode.dataset.dir ?? "";
      const neighbors = this.state.adjacency.get(dir) ?? new Set<string>();
      for (const element of qsa<HTMLElement>(this.nodesLayer, ".gnode")) {
        const elementDir = element.dataset.dir ?? "";
        const isRelated = elementDir === dir || neighbors.has(elementDir);
        element.classList.toggle("faded", !isRelated);
        element.classList.toggle("focus", elementDir === dir);
      }
      for (const line of qsa<SVGLineElement>(this.edgesSvg, "line")) {
        const active = line.dataset.a === dir || line.dataset.b === dir;
        line.setAttribute("stroke-opacity", active ? "0.95" : "0.08");
        line.setAttribute("stroke", active ? "#9db4ff" : "#5b6172");
      }
    });

    this.nodesLayer.addEventListener("mouseleave", () => {
      for (const element of qsa<HTMLElement>(this.nodesLayer, ".gnode")) {
        element.classList.remove("faded", "focus");
      }
      for (const line of qsa<SVGLineElement>(this.edgesSvg, "line")) {
        line.setAttribute("stroke-opacity", "0.45");
        line.setAttribute("stroke", "#5b6172");
      }
    });
  }

  setScope(path: string): void {
    const normalized = path.trim().replace(/\/+$/, "");
    if (normalized && !this.model.validScope(normalized)) {
      this.scopeError.textContent = t("scope.invalid");
      this.scopeError.classList.remove("hidden");
      return;
    }
    this.scopeError.classList.add("hidden");
    this.state.scopePath = normalized;
    this.scopeInput.value = normalized;
    this.scopeBar.classList.toggle("scoped", Boolean(normalized));
    this.state.userAdjusted = false;
    this.model.build();
    this.render();
  }

  private setupScope(): void {
    byId("scope-root").addEventListener("click", () => {
      this.setScope("");
      this.hideSuggestions();
    });
    this.scopeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        if (this.activeSuggestion >= 0) {
          this.acceptSuggestion();
        } else {
          this.setScope(this.scopeInput.value);
        }
        this.hideSuggestions();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveSuggestion(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveSuggestion(-1);
        return;
      }
      if (event.key === "Escape") {
        this.hideSuggestions();
        return;
      }
    });
    this.scopeInput.addEventListener("input", () => this.updateSuggestions());
    this.scopeInput.addEventListener("blur", () => {
      // Delay to allow click on suggestion to fire first.
      setTimeout(() => {
        this.hideSuggestions();
        if (this.scopeInput.value.trim() !== this.state.scopePath) {
          this.setScope(this.scopeInput.value);
        }
      }, 150);
    });
    this.scopeInput.addEventListener("focus", () => this.updateSuggestions());
    this.scopeSuggestions.addEventListener("mousedown", (event) => {
      const item = (event.target as Element | null)?.closest<HTMLElement>(".scope-item");
      if (item) {
        this.setScope(item.dataset.dir ?? "");
        this.hideSuggestions();
      }
    });
    // Double-click a graph node → scope into that folder.
    this.nodesLayer.addEventListener("dblclick", (event) => {
      const gnode = (event.target as Element | null)?.closest<HTMLElement>(".gnode");
      const dir = gnode?.dataset.dir ?? "";
      if (dir) {
        this.setScope(dir);
      }
    });
  }

  private updateSuggestions(): void {
    const query = this.scopeInput.value.trim().toLowerCase();
    if (!query) {
      this.hideSuggestions();
      return;
    }
    const allDirs = this.model.allDirs();
    const matches = [...allDirs]
      .filter((dir) => dir.toLowerCase().includes(query) && dir !== query)
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      })
      .slice(0, 8);
    if (matches.length === 0) {
      this.hideSuggestions();
      return;
    }
    this.activeSuggestion = -1;
    this.scopeSuggestions.innerHTML = matches
      .map((dir) => `<button class="scope-item" data-dir="${escapeHtml(dir)}">${escapeHtml(dir)}</button>`)
      .join("");
    this.scopeSuggestions.classList.remove("hidden");
  }

  private hideSuggestions(): void {
    this.scopeSuggestions.classList.add("hidden");
    this.activeSuggestion = -1;
  }

  private moveSuggestion(delta: number): void {
    const items = this.scopeSuggestions.querySelectorAll<HTMLElement>(".scope-item");
    if (items.length === 0) {
      return;
    }
    if (this.activeSuggestion >= 0 && items[this.activeSuggestion]) {
      items[this.activeSuggestion]!.classList.remove("active");
    }
    this.activeSuggestion = Math.max(0, Math.min(items.length - 1, this.activeSuggestion + delta));
    items[this.activeSuggestion]!.classList.add("active");
  }

  private acceptSuggestion(): void {
    const items = this.scopeSuggestions.querySelectorAll<HTMLElement>(".scope-item");
    if (this.activeSuggestion >= 0 && items[this.activeSuggestion]) {
      this.setScope(items[this.activeSuggestion]!.dataset.dir ?? "");
    }
  }

  private setupAutoFit(): void {
    const observer = new ResizeObserver(() => {
      if (!this.state.userAdjusted && this.state.mode === "graph") {
        this.fitView();
      }
    });
    observer.observe(this.viewport);
  }
}
