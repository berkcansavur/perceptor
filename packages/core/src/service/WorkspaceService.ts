import * as fs from "fs";
import * as path from "path";
import type { Graph } from "../core";
import { RepoSession } from "./repo/RepoSession";
import { Scaffolder } from "./repo/Scaffolder";
import { DirectoryBrowser } from "./repo/DirectoryBrowser";
import { GitInspector } from "./repo/GitInspector";
import type { CreatePayload, FileOpener } from "./types";
import {
  FileExistsException,
  InvalidNameException,
  NotADirectoryException,
  OutOfRepoException,
  SourceNotFoundException,
  UnsupportedActionException,
} from "./exception";

// Workspace filesystem & graph operations: the analyzed dependency graph, file reads,
// scaffolding, git status, and editor hand-off — everything that revolves around the
// current repo root. Owns the RepoSession (the single source of the current root + graph).
// Each method returns its raw payload and THROWS a DomainException on a business failure;
// the envelope + error mapping happen once at the dispatch boundary.
export class WorkspaceService {
  private readonly scaffolder = new Scaffolder();
  private readonly browser = new DirectoryBrowser();
  private readonly git = new GitInspector();

  constructor(
    private readonly session: RepoSession,
    private readonly fileOpener: FileOpener | null,
    private readonly localeProvider: () => string
  ) {}

  async init(): Promise<void> {
    await this.session.reanalyze();
  }

  meta(): { root: string; hostRoot: string; version: number; locale: string } {
    return {
      root: this.session.currentRoot,
      hostRoot: this.session.currentRoot,
      version: this.session.graphVersion,
      locale: this.localeProvider(),
    };
  }

  root(): string {
    return this.session.currentRoot;
  }

  graph(): Graph | null {
    return this.session.graph();
  }

  async reanalyze(): Promise<{ root: string; stats: Graph["stats"] }> {
    const graph = await this.session.reanalyze();
    return { root: this.session.currentRoot, stats: graph.stats };
  }

  async open(targetPath: string): Promise<{ root: string; hostRoot: string; stats: Graph["stats"] }> {
    const resolved = path.resolve(targetPath.replace(/^~(?=$|\/)/, process.env["HOME"] ?? ""));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new NotADirectoryException(targetPath);
    }
    const graph = await this.session.open(resolved);
    return { root: resolved, hostRoot: resolved, stats: graph.stats };
  }

  fileTemplates(): Pick<Scaffolder, "extensionFamily" | "familyTemplates"> {
    return {
      extensionFamily: this.scaffolder.extensionFamily,
      familyTemplates: this.scaffolder.familyTemplates,
    };
  }

  source(file: string, from: number, to: number): { code: string } {
    const root = this.session.currentRoot;
    const absolute = path.resolve(root, file);
    if (!absolute.startsWith(path.resolve(root))) {
      throw new OutOfRepoException(file);
    }
    try {
      const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/);
      return { code: lines.slice(Math.max(0, from - 1), to).join("\n") };
    } catch {
      throw new SourceNotFoundException(file);
    }
  }

  browse(targetPath: string | null): ReturnType<DirectoryBrowser["list"]> {
    return this.browser.list(targetPath);
  }

  gitStatus(): ReturnType<GitInspector["status"]> {
    return this.git.status(this.session.currentRoot);
  }

  // Resolve a repo-relative file to its absolute path and hand it to the host's editor.
  // A host that wired no opener (CLI/web) reports the action as unsupported.
  async openFile(file: string, line: number): Promise<{ file: string }> {
    if (!this.fileOpener) {
      throw new UnsupportedActionException("openFile");
    }
    await this.fileOpener.open(path.join(this.session.currentRoot, file), Math.max(0, line - 1));
    return { file };
  }

  async create(payload: CreatePayload): Promise<{ stats: Graph["stats"] }> {
    const directory = payload.dir.replace(/^\/+/, "");
    const name = payload.name.trim();
    if (!name || name.includes("/") || name.includes("..")) {
      throw new InvalidNameException(name);
    }
    const repoRoot = path.resolve(this.session.currentRoot);
    const absoluteDir = path.resolve(repoRoot, directory);
    const targetPath = path.join(absoluteDir, name);
    if (absoluteDir !== repoRoot && !absoluteDir.startsWith(repoRoot + path.sep)) {
      throw new OutOfRepoException(directory);
    }
    // An unexpected fs error (permissions, IO) is not a domain failure — let it bubble
    // to the funnel's INTERNAL_ERROR rather than masking it as a create failure.
    if (payload.kind === "folder") {
      fs.mkdirSync(targetPath, { recursive: true });
    } else {
      if (fs.existsSync(targetPath)) {
        throw new FileExistsException(targetPath);
      }
      fs.mkdirSync(absoluteDir, { recursive: true });
      const content = this.scaffolder.generate({
        fileName: name,
        template: payload.template,
        typeName: payload.typeName,
        goPackage: payload.goPackage,
        dir: directory,
        absoluteDir,
      });
      fs.writeFileSync(targetPath, content);
    }
    const graph = await this.session.reanalyze();
    return { stats: graph.stats };
  }
}
