import { ApiClient } from "./api/ApiClient";
import { AppState } from "./state/AppState";
import { Emitter } from "./events";
import { GraphModel } from "./graph/GraphModel";
import { GraphView } from "./graph/GraphView";
import { FolderTree } from "./tree/FolderTree";
import { TasksPanel } from "./tasks/TasksPanel";
import { AutoProcessControl } from "./tasks/AutoProcessControl";
import { BehaviorForm } from "./forms/BehaviorForm";
import { EditForm } from "./forms/EditForm";
import { CreateForm } from "./forms/CreateForm";
import { OpenRepoModal } from "./forms/OpenRepoModal";
import { Toolbar } from "./ui/Toolbar";
import { Toast } from "./ui/Toast";
import type { ViewMode } from "./types";
import { byId } from "./dom";
import { applyI18n, onLangChange } from "./i18n";

// Composition root: builds the object graph, wires cross-component events, and
// owns the top-level "load graph" / "switch mode" flows.
export class App {
  private readonly api = new ApiClient();
  private readonly state = new AppState();
  private readonly bus = new Emitter();
  private readonly toast = new Toast();
  private readonly model = new GraphModel(this.state);
  private readonly graphView = new GraphView(this.state, this.model, this.bus);
  private readonly folderTree = new FolderTree(this.state, this.bus);
  private readonly tasksPanel = new TasksPanel(this.api, this.bus);
  private readonly autoProcess = new AutoProcessControl(this.api);
  private readonly behaviorForm = new BehaviorForm(this.api, this.bus);
  private readonly editForm = new EditForm(this.api, this.bus);
  private readonly createForm = new CreateForm(this.api, this.bus);
  private readonly openRepo = new OpenRepoModal(this.api, this.state, this.bus);
  private readonly toolbar = new Toolbar(this.state, this.bus);
  private readonly empty = byId("empty");
  private readonly stats = byId("stats");

  start(): void {
    this.graphView.setup();
    this.folderTree.setup();
    this.behaviorForm.setup();
    this.editForm.setup();
    this.createForm.setup();
    this.tasksPanel.setup();
    this.autoProcess.setup();
    this.toolbar.setup();
    this.openRepo.setup();
    this.wireBus();

    // The workspace is fixed to the editor's open folder; the in-app repo
    // switcher is meaningless inside the extension.
    byId("open-repo").style.display = "none";
    applyI18n();
    onLangChange(() => {
      this.folderTree.render();
      void this.tasksPanel.refresh(true);
    });
    this.setupAutoRefresh();
    void this.loadGraph();
  }

  private wireBus(): void {
    this.bus.on("toast", (message) => this.toast.show(message));
    this.bus.on("graph:reload", () => void this.loadGraph());
    this.bus.on("graph:relayout", () => this.graphView.relayout());
    this.bus.on("mode:set", (mode) => this.setMode(mode));
    this.bus.on("folder:open", (dir) => {
      this.setMode("folder");
      this.folderTree.revealFolder(dir);
    });
    this.bus.on("search:changed", () => this.applySearch());
    this.bus.on("file:open", ({ file, line }) => void this.api.openFile(file, line));
  }

  private async loadGraph(): Promise<void> {
    const graph = await this.api.graph();
    if (!graph) {
      this.empty.classList.remove("hidden");
      return;
    }
    this.state.nodes = graph.nodes;
    this.state.edges = graph.edges;
    this.state.directories = graph.directories ?? [];
    this.state.nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    this.empty.classList.toggle("hidden", this.state.nodes.length > 0);
    this.stats.textContent = `${graph.stats.classes} classes · ${graph.stats.edges} edges · ${Object.entries(
      graph.stats.byLanguage
    )
      .map(([language, count]) => `${language}:${count}`)
      .join(" ")}`;

    this.model.build();
    this.model.layout();
    this.graphView.render();
    this.folderTree.render();
    this.applySearch();
    if (!this.state.userAdjusted) {
      requestAnimationFrame(() => this.graphView.fitView());
    }
  }

  private setMode(mode: ViewMode): void {
    this.state.mode = mode;
    const isGraph = mode === "graph";
    byId("viewport").classList.toggle("hidden", !isGraph);
    byId("tree").classList.toggle("hidden", isGraph);
    byId("mode-graph").classList.toggle("active", isGraph);
    byId("mode-folder").classList.toggle("active", !isGraph);
    byId("relayout").classList.toggle("hidden", !isGraph);
    this.applySearch();
  }

  private applySearch(): void {
    if (this.state.mode === "graph") {
      this.graphView.applySearch();
    } else {
      this.folderTree.applySearch();
    }
  }

  private setupAutoRefresh(): void {
    let lastVersion: number | null = null;
    setInterval(async () => {
      let version: number | undefined;
      try {
        version = (await this.api.meta()).version;
      } catch {
        return;
      }
      if (version === undefined) {
        return;
      }
      if (lastVersion === null) {
        lastVersion = version;
        return;
      }
      if (version !== lastVersion) {
        lastVersion = version;
        void this.loadGraph();
      }
    }, 3000);
  }
}
