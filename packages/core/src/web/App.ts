import { ApiClient } from "./api/ApiClient";
import { AppState } from "./state/AppState";
import { Emitter } from "./Emitter";
import { GraphModel } from "./graph/GraphModel";
import { GraphView } from "./graph/GraphView";
import { FolderTree } from "./tree/FolderTree";
import { BehaviorDrawer } from "./tree/BehaviorDrawer";
import { TasksPanel } from "./tasks/TasksPanel";
import { ChatPanel } from "./chat/ChatPanel";
import { ChangesView } from "./changes/ChangesView";
import { AutoProcessControl } from "./tasks/AutoProcessControl";
import { BehaviorForm } from "./forms/BehaviorForm";
import { EditForm } from "./forms/EditForm";
import { CreateForm } from "./forms/CreateForm";
import { OpenRepoModal } from "./forms/OpenRepoModal";
import { PreferencesForm } from "./forms/PreferencesForm";
import { Toolbar } from "./ui/Toolbar";
import { Toast } from "./ui/Toast";
import type { ViewMode } from "./types";
import { byId } from "./dom";
import { applyI18n, getCurrentLang, onLangChange, setLang, t } from "./i18n";

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
  private readonly behaviorDrawer = new BehaviorDrawer(this.api, this.bus);
  private readonly tasksPanel = new TasksPanel(this.api, this.bus);
  private readonly chatPanel = new ChatPanel(this.api, this.bus);
  private readonly changesView = new ChangesView(this.api, this.bus);
  private readonly chatAutoProcess = new AutoProcessControl(
    this.api,
    { container: "chat-auto", toggle: "chat-auto-toggle", label: "chat-auto-label", status: "chat-auto-status" },
    this.bus
  );
  private readonly behaviorForm = new BehaviorForm(this.api, this.bus);
  private readonly editForm = new EditForm(this.api, this.bus);
  private readonly createForm = new CreateForm(this.api, this.bus);
  private readonly openRepo = new OpenRepoModal(this.api, this.state, this.bus);
  private readonly preferencesForm = new PreferencesForm(this.api, this.bus);
  private readonly toolbar = new Toolbar(this.state, this.bus);
  private readonly empty = byId("empty");
  private readonly stats = byId("stats");

  start(): void {
    this.graphView.setup();
    this.folderTree.setup();
    this.behaviorDrawer.setup();
    this.behaviorForm.setup();
    this.editForm.setup();
    this.createForm.setup();
    this.tasksPanel.setup();
    this.chatPanel.setup();
    this.changesView.setup();
    this.chatAutoProcess.setup();
    this.toolbar.setup();
    this.openRepo.setup();
    this.preferencesForm.setup();
    this.wireBus();

    // The workspace is fixed to the editor's open folder; the in-app repo
    // switcher is meaningless inside the extension.
    byId("open-repo").style.display = "none";
    applyI18n();
    onLangChange(() => {
      // The locale is one full-stack source of truth: persist it so Claude
      // generates its text (messages, summaries, commits) in the same language.
      void this.api.setLocale(getCurrentLang());
      this.folderTree.render();
      void this.tasksPanel.refresh(true);
      void this.chatPanel.refresh(true);
      void this.changesView.refresh(true);
    });
    this.setupAutoRefresh();
    void this.syncLocale();
    void this.loadGraph();
  }

  // Adopt the persisted (disk) locale on startup so the UI and Claude's generated
  // text always agree, even in a fresh webview.
  private async syncLocale(): Promise<void> {
    let locale: string | null = null;
    try {
      locale = (await this.api.meta()).locale;
    } catch {
      return;
    }
    if (locale && locale !== getCurrentLang()) {
      setLang(locale);
    }
  }

  private wireBus(): void {
    this.bus.on("toast", (message) => this.toast.show(message));
    this.bus.on("graph:reload", () => void this.loadGraph());
    this.bus.on("graph:reanalyze", () => void this.reanalyze());
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
    this.graphView.render();
    this.folderTree.render();
    this.applySearch();
  }

  private static readonly SECTION_BY_MODE: Record<ViewMode, string> = {
    graph: "viewport",
    folder: "tree",
    chat: "chat",
    changes: "changes",
  };

  // Modes that own a top-bar button. Changes has none — it's opened only from a
  // chat request's "View changes", so its section is shown without a tab to toggle.
  private static readonly BUTTON_MODES: readonly ViewMode[] = ["graph", "folder", "chat"];

  // Manual re-scan: the file watcher can miss bulk/nested edits (e.g. a refactor
  // that creates new folders), leaving the graph stale — this forces a fresh analysis.
  private async reanalyze(): Promise<void> {
    this.toast.show(t("toast.reanalyzing"));
    try {
      await this.api.reanalyze();
      this.state.userAdjusted = false;
      await this.loadGraph();
      this.toast.show(t("toast.reanalyzed"));
    } catch {
      this.toast.show(t("toast.reanalyzeFailed"));
    }
  }

  private setMode(mode: ViewMode): void {
    this.state.mode = mode;
    for (const [candidate, section] of Object.entries(App.SECTION_BY_MODE)) {
      byId(section).classList.toggle("hidden", candidate !== mode);
    }
    for (const button of App.BUTTON_MODES) {
      byId(`mode-${button}`).classList.toggle("active", button === mode);
    }
    byId("relayout").classList.toggle("hidden", mode !== "graph");
    this.applySearch();
  }

  private applySearch(): void {
    if (this.state.mode === "graph") {
      this.graphView.applySearch();
    } else if (this.state.mode === "folder") {
      this.folderTree.applySearch();
    }
  }

  private setupAutoRefresh(): void {
    let lastVersion: number | null = null;
    setInterval(async () => {
      let version: number | null = null;
      try {
        version = (await this.api.meta()).version;
      } catch {
        return;
      }
      if (version === null) {
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
