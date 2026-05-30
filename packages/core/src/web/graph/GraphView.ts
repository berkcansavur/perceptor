import type { AppState } from "../state/AppState";
import type { Emitter } from "../events";
import type { GraphModel } from "./GraphModel";
import { byId, escapeHtml, qsa } from "../dom";

const SVG_NS = "http://www.w3.org/2000/svg";

// Renders the folder graph (SVG edges + DOM circle nodes) and handles
// pan/zoom/drag/hover. Emits "folder:open" when a node is clicked.
export class GraphView {
  private readonly viewport = byId("viewport");
  private readonly world = byId("world");
  private readonly edgesSvg = document.getElementById("edges") as unknown as SVGSVGElement;
  private readonly nodesLayer = byId("nodes");
  private readonly search = byId<HTMLInputElement>("search");

  constructor(
    private readonly state: AppState,
    private readonly model: GraphModel,
    private readonly bus: Emitter
  ) {}

  setup(): void {
    this.setupPanZoom();
    this.setupNodeDrag();
    this.setupHover();
    this.setupAutoFit();
  }

  render(): void {
    this.renderEdges();
    this.renderNodes();
    this.applyView();
  }

  relayout(): void {
    this.state.userAdjusted = false;
    this.model.layout();
    this.render();
    this.applySearch();
    this.fitView();
  }

  applyView(): void {
    const { x, y, scale } = this.state.view;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  fitView(): void {
    const extent = this.model.extent();
    const rect = this.viewport.getBoundingClientRect();
    if (!extent.width || !extent.height || rect.width < 10 || rect.height < 10) {
      return;
    }
    const scale = Math.min(rect.width / extent.width, rect.height / extent.height) * 0.92;
    this.state.view.scale = Math.max(0.1, Math.min(1.6, scale));
    this.state.view.x = (rect.width - extent.width * this.state.view.scale) / 2;
    this.state.view.y = (rect.height - extent.height * this.state.view.scale) / 2;
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

  private renderEdges(): void {
    const extent = this.model.extent();
    this.edgesSvg.setAttribute("width", String(extent.width));
    this.edgesSvg.setAttribute("height", String(extent.height));
    this.edgesSvg.innerHTML = "";
    for (const edge of this.state.folderEdges) {
      const from = this.state.position.get(edge.a);
      const to = this.state.position.get(edge.b);
      if (!from || !to) {
        continue;
      }
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(from.x));
      line.setAttribute("y1", String(from.y));
      line.setAttribute("x2", String(to.x));
      line.setAttribute("y2", String(to.y));
      line.setAttribute("stroke", "#5b6172");
      line.setAttribute("stroke-width", String(Math.min(5, 0.6 + edge.weight * 0.5)));
      line.setAttribute("stroke-opacity", "0.45");
      line.dataset.a = edge.a;
      line.dataset.b = edge.b;
      this.edgesSvg.appendChild(line);
    }
  }

  private renderNodes(): void {
    this.nodesLayer.innerHTML = "";
    for (const folder of this.state.folderNodes) {
      const position = this.state.position.get(folder.dir);
      if (!position) {
        continue;
      }
      const element = document.createElement("div");
      element.className = "gnode";
      element.dataset.dir = folder.dir;
      element.style.left = `${position.x}px`;
      element.style.top = `${position.y}px`;
      const diameter = folder.radius * 2;
      element.innerHTML = `
        <div class="gdot" style="width:${diameter}px;height:${diameter}px;background:${folder.color.fill};border-color:${folder.color.stroke}"></div>
        <div class="glabel" title="${escapeHtml(folder.dir)}">${escapeHtml(folder.label)} <span class="gdeg">${folder.degree}</span></div>`;
      this.nodesLayer.appendChild(element);
    }
  }

  private updateEdgesFor(dir: string): void {
    const center = this.state.position.get(dir);
    if (!center) {
      return;
    }
    for (const line of qsa<SVGLineElement>(this.edgesSvg, "line")) {
      if (line.dataset.a === dir) {
        line.setAttribute("x1", String(center.x));
        line.setAttribute("y1", String(center.y));
      }
      if (line.dataset.b === dir) {
        line.setAttribute("x2", String(center.x));
        line.setAttribute("y2", String(center.y));
      }
    }
  }

  private cssEscape(value: string): string {
    return value.replace(/["\\]/g, "\\$&");
  }

  private setupPanZoom(): void {
    let panning = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    this.viewport.addEventListener("mousedown", (event) => {
      if ((event.target as Element | null)?.closest(".gnode")) {
        return;
      }
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
        this.state.userAdjusted = true;
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const newScale = Math.max(0.1, Math.min(3, this.state.view.scale * factor));
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
      if (!gnode) {
        return;
      }
      draggingDir = gnode.dataset.dir ?? null;
      if (!draggingDir) {
        return;
      }
      this.state.userAdjusted = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const position = this.state.position.get(draggingDir);
      if (!position) {
        return;
      }
      originX = position.x;
      originY = position.y;
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
      }
      const position = this.state.position.get(draggingDir);
      if (!position) {
        return;
      }
      position.x = originX + deltaX;
      position.y = originY + deltaY;
      const element = this.nodesLayer.querySelector<HTMLElement>(`.gnode[data-dir="${this.cssEscape(draggingDir)}"]`);
      if (element) {
        element.style.left = `${position.x}px`;
        element.style.top = `${position.y}px`;
      }
      this.updateEdgesFor(draggingDir);
    });

    window.addEventListener("mouseup", () => {
      if (draggingDir && !moved) {
        this.bus.emit("folder:open", draggingDir);
      }
      draggingDir = null;
    });
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

  private setupAutoFit(): void {
    const observer = new ResizeObserver(() => {
      if (!this.state.userAdjusted && this.state.mode === "graph") {
        this.fitView();
      }
    });
    observer.observe(this.viewport);
  }
}
